import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { HealthReport, ServerMessage } from "@mycelium/shared";
import { parseClientMessage } from "@mycelium/shared";
import { WebSocketServer, type WebSocket } from "ws";
import { APP_VERSION } from "./config";

/** A dependency the health endpoint pings. `undefined` means not configured. */
export type HealthProbe = (() => Promise<void>) | undefined;

export interface AppDeps {
  probes: Record<string, HealthProbe>;
  startedAt?: number;
}

export async function buildHealthReport(deps: AppDeps): Promise<HealthReport> {
  const checks: HealthReport["checks"] = {};
  await Promise.all(
    Object.entries(deps.probes).map(async ([name, probe]) => {
      if (!probe) {
        checks[name] = "disabled";
        return;
      }
      try {
        await withTimeout(probe(), 2000);
        checks[name] = "ok";
      } catch {
        checks[name] = "down";
      }
    }),
  );
  const status = Object.values(checks).includes("down") ? "degraded" : "ok";
  const startedAt = deps.startedAt ?? Date.now();
  return {
    status,
    version: APP_VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    checks,
  };
}

export function createApp(deps: AppDeps): Server {
  const startedAt = deps.startedAt ?? Date.now();
  const server = createServer((req, res) => {
    void handleHttp(req, res, { ...deps, startedAt });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });
  server.on("close", () => wss.close());
  return server;
}

async function handleHttp(req: IncomingMessage, res: ServerResponse, deps: AppDeps): Promise<void> {
  if (req.method === "GET" && req.url === "/api/health") {
    const report = await buildHealthReport(deps);
    sendJson(res, report.status === "ok" ? 200 : 503, report);
    return;
  }
  sendJson(res, 404, { error: "not_found" });
}

function onConnection(ws: WebSocket): void {
  send(ws, { type: "welcome", version: APP_VERSION, serverTime: Date.now() });
  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (msg?.type === "ping") send(ws, { type: "pong", serverTime: Date.now() });
  });
}

function send(ws: WebSocket, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
