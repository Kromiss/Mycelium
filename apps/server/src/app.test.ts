import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket from "ws";
import type { ServerMessage, SessionResponse } from "@mycelium/shared";
import { buildHealthReport, createApp } from "./app";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(probes: Parameters<typeof createApp>[0]["probes"]): Promise<string> {
  server = createApp({ probes });
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `127.0.0.1:${port}`;
}

describe("health", () => {
  it("is ok when dependencies are up or not configured", async () => {
    const report = await buildHealthReport({ probes: { postgres: async () => {}, redis: undefined } });
    expect(report.status).toBe("ok");
    expect(report.checks).toEqual({ postgres: "ok", redis: "disabled" });
  });

  it("is degraded when a dependency is down", async () => {
    const report = await buildHealthReport({
      probes: {
        postgres: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(report.status).toBe("degraded");
    expect(report.checks.postgres).toBe("down");
  });

  it("answers 200 / 503 over HTTP", async () => {
    const host = await start({ postgres: undefined });
    const ok = await fetch(`http://${host}/api/health`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "ok" });

    const missing = await fetch(`http://${host}/nope`);
    expect(missing.status).toBe(404);
  });
});

describe("websocket", () => {
  it("greets then answers ping with pong", async () => {
    const host = await start({});
    const ws = new WebSocket(`ws://${host}/ws`);
    const messages: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on("error", reject);
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString()));
        if (messages.length === 1) ws.send(JSON.stringify({ type: "ping" }));
        if (messages.length === 2) resolve();
      });
    });
    ws.close();
    expect(messages[0]).toMatchObject({ type: "welcome" });
    expect(messages[1]).toMatchObject({ type: "pong" });
  });
});

async function post(host: string, path: string, body: unknown, token?: string) {
  return fetch(`http://${host}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Opens a socket and collects messages; `next(type)` waits for the next message of that type. */
function openSocket(host: string) {
  const ws = new WebSocket(`ws://${host}/ws`);
  const queue: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (data) => {
    queue.push(JSON.parse(data.toString()) as ServerMessage);
    waiters.splice(0).forEach((w) => w());
  });
  async function next<T extends ServerMessage["type"]>(type: T): Promise<Extract<ServerMessage, { type: T }>> {
    for (;;) {
      const i = queue.findIndex((m) => m.type === type);
      if (i >= 0) return queue.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 2000);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }
  const closed = new Promise<void>((resolve) => ws.on("close", () => resolve()));
  const opened = new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const send = (m: unknown) => void opened.then(() => ws.send(JSON.stringify(m)));
  return { ws, next, send, closed };
}

describe("accounts API", () => {
  it("registers, logs in and out, and refuses bad input", async () => {
    const host = await start({});
    const ok = await post(host, "/api/register", { name: "Mycena", password: "correct horse" });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as SessionResponse;
    expect(body.player.name).toBe("Mycena");

    expect((await post(host, "/api/register", { name: "mycena", password: "correct horse" })).status).toBe(409);
    expect((await post(host, "/api/register", { name: "a b", password: "correct horse" })).status).toBe(400);
    expect((await post(host, "/api/register", { name: "Other", password: "short" })).status).toBe(400);
    expect((await post(host, "/api/register", "{broken")).status).toBe(400);
    expect((await post(host, "/api/register", { name: "x".repeat(2000), password: "p" })).status).toBe(400);

    expect((await post(host, "/api/login", { name: "Mycena", password: "correct horse" })).status).toBe(200);
    expect((await post(host, "/api/login", { name: "Mycena", password: "wrong one!" })).status).toBe(401);
    expect((await post(host, "/api/password", { password: "whatever long" })).status).toBe(401);
    expect((await post(host, "/api/password", { password: "whatever long" }, body.token)).status).toBe(409);
    expect((await post(host, "/api/logout", {}, body.token)).status).toBe(204);
  });
});

describe("game over websocket", () => {
  it("authenticates, plays, and finds the same game after a reload", async () => {
    const host = await start({});
    const reg = await post(host, "/api/register", { name: "Reloader", password: "correct horse" });
    const { token } = (await reg.json()) as SessionResponse;

    const tab = openSocket(host);
    await tab.next("welcome");
    tab.send({ type: "colonize", q: 1, r: 0 });
    expect((await tab.next("actionError")).error).toBe("not_authenticated");

    tab.send({ type: "auth", token });
    const ready = await tab.next("ready");
    expect(ready.player.name).toBe("Reloader");
    expect(ready.forest.number).toBe(1);
    await tab.next("leaderboard");
    tab.send({ type: "buyUpgrade", upgrade: "nope" });
    expect((await tab.next("actionError")).error).toBe("unknown_upgrade");

    tab.ws.close();
    await tab.closed;

    const reloaded = openSocket(host);
    reloaded.send({ type: "auth", token });
    const again = await reloaded.next("ready");
    expect(again.forest.id).toBe(ready.forest.id);
    expect(again.game.spawn).toEqual(ready.game.spawn);
    expect(again.game.tiles.map((t) => [t.q, t.r, t.owner])).toEqual(ready.game.tiles.map((t) => [t.q, t.r, t.owner]));
    expect(again.game.nutrients).toBeGreaterThanOrEqual(ready.game.nutrients);
    reloaded.ws.close();
  });

  it("rejects an unknown token", async () => {
    const host = await start({});
    const tab = openSocket(host);
    tab.send({ type: "auth", token: "not-a-real-token" });
    await tab.next("authError");
    tab.ws.close();
  });
});
