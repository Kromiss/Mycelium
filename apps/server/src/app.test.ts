import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket from "ws";
import type { GuestResponse, ServerMessage } from "@mycelium/shared";
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

async function postGuest(host: string, body: unknown) {
  return fetch(`http://${host}/api/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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

describe("guest API", () => {
  it("creates a guest, refuses bad or taken names", async () => {
    const host = await start({});
    const ok = await postGuest(host, { name: "Mycena" });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as GuestResponse;
    expect(body.player.name).toBe("Mycena");
    expect(typeof body.token).toBe("string");

    expect((await postGuest(host, { name: "mycena" })).status).toBe(409);
    expect((await postGuest(host, { name: "a b" })).status).toBe(400);
    expect((await postGuest(host, "{broken")).status).toBe(400);
    expect((await postGuest(host, { name: "x".repeat(2000) })).status).toBe(400);
  });
});

describe("game over websocket", () => {
  it("authenticates, plays, and finds the same game after a reload", async () => {
    const host = await start({});
    const { token } = (await (await postGuest(host, { name: "Reloader" })).json()) as GuestResponse;

    const tab = openSocket(host);
    await tab.next("welcome");
    tab.send({ type: "colonize", q: 1, r: 0 });
    expect((await tab.next("actionError")).error).toBe("not_authenticated");

    tab.send({ type: "auth", token });
    const ready = await tab.next("ready");
    expect(ready.player.name).toBe("Reloader");
    tab.send({ type: "buyUpgrade", upgrade: "nope" });
    expect((await tab.next("actionError")).error).toBe("unknown_upgrade");

    tab.ws.close();
    await tab.closed;

    const reloaded = openSocket(host);
    reloaded.send({ type: "auth", token });
    const again = await reloaded.next("ready");
    expect(again.game.seed).toBe(ready.game.seed);
    expect(again.game.terrain).toBe(ready.game.terrain);
    expect(again.game.owned).toEqual(ready.game.owned);
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
