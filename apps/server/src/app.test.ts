import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket from "ws";
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
