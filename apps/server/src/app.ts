import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AuthError, Credentials, HealthReport, PlayerInfo, ServerMessage } from "@mycelium/shared";
import { parseClientMessage } from "@mycelium/shared";
import { WebSocketServer, type WebSocket } from "ws";
import { APP_VERSION } from "./config";
import { ForestService, type GameClient } from "./forest-service";
import { MemoryStore } from "./store";

/** A dependency the health endpoint pings. `undefined` means not configured. */
export type HealthProbe = (() => Promise<void>) | undefined;

export interface AppDeps {
  probes: Record<string, HealthProbe>;
  startedAt?: number;
  /** Game simulation; defaults to an in-memory one (tests, local dev without Postgres). */
  game?: ForestService;
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
  const game = deps.game ?? new ForestService(new MemoryStore());
  const server = createServer((req, res) => {
    handleHttp(req, res, { ...deps, startedAt }, game).catch((err: unknown) => {
      console.error("[http]", err);
      if (!res.headersSent) sendJson(res, 500, { error: "internal" });
      else res.end();
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, game));
  });
  server.on("close", () => wss.close());
  return server;
}

const AUTH_STATUS: Record<AuthError, number> = {
  invalid_name: 400,
  weak_password: 400,
  name_taken: 409,
  wrong_credentials: 401,
  too_many_attempts: 429,
};

async function handleHttp(req: IncomingMessage, res: ServerResponse, deps: AppDeps, game: ForestService): Promise<void> {
  if (req.method === "GET" && req.url === "/api/health") {
    const report = await buildHealthReport(deps);
    sendJson(res, report.status === "ok" ? 200 : 503, report);
    return;
  }
  if (req.method === "POST" && (req.url === "/api/register" || req.url === "/api/login")) {
    const body = (await readJson(req, 1024)) as Partial<Credentials> | null;
    if (typeof body?.name !== "string" || typeof body.password !== "string") {
      sendJson(res, 400, { error: "invalid_name" });
      return;
    }
    const result =
      req.url === "/api/register"
        ? await game.register(body.name, body.password)
        : await game.login(body.name, body.password, req.socket.remoteAddress ?? "");
    if (result.ok) sendJson(res, req.url === "/api/register" ? 201 : 200, result.session);
    else sendJson(res, AUTH_STATUS[result.error], { error: result.error });
    return;
  }
  if (req.method === "POST" && req.url === "/api/password") {
    const token = bearer(req);
    const body = (await readJson(req, 1024)) as { password?: unknown } | null;
    if (!token || typeof body?.password !== "string") {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    const result = await game.setPassword(token, body.password);
    const status = { ok: 204, unauthorized: 401, weak_password: 400, already_set: 409 }[result];
    if (status === 204) {
      res.writeHead(204).end();
      return;
    }
    sendJson(res, status, { error: result });
    return;
  }
  if (req.method === "POST" && req.url === "/api/logout") {
    const token = bearer(req);
    if (token) await game.logout(token);
    res.writeHead(204).end();
    return;
  }
  sendJson(res, 404, { error: "not_found" });
}

function bearer(req: IncomingMessage): string | null {
  const m = /^Bearer (\S{1,200})$/.exec(req.headers.authorization ?? "");
  return m?.[1] ?? null;
}

function onConnection(ws: WebSocket, game: ForestService): void {
  const client: GameClient = { send: (msg) => send(ws, msg) };
  let player: PlayerInfo | null = null;
  let authenticating = false;

  send(ws, { type: "welcome", version: APP_VERSION, serverTime: Date.now() });
  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) return;
    switch (msg.type) {
      case "ping":
        send(ws, { type: "pong", serverTime: Date.now() });
        return;
      case "auth":
        if (player || authenticating) return;
        authenticating = true;
        void (async () => {
          const found = await game.authenticate(msg.token);
          if (!found || ws.readyState !== ws.OPEN || !(await game.attach(found, client))) {
            send(ws, { type: "authError" });
            authenticating = false;
            return;
          }
          player = found;
          // The socket may have closed while the game was loading.
          if (ws.readyState !== ws.OPEN) void game.detach(found.id, client);
        })().catch((err: unknown) => {
          console.error("[ws] auth failed", err);
          authenticating = false;
          send(ws, { type: "authError" });
        });
        return;
      case "colonize":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.colonize(player.id, msg.q, msg.r, client);
        return;
      case "unqueue":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.unqueue(player.id, msg.q, msg.r, client);
        return;
      case "moveHeart":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.moveHeart(player.id, msg.q, msg.r, client);
        return;
      case "buyUpgrade":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.buyUpgrade(player.id, msg.upgrade, client);
        return;
      case "build":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.build(player.id, msg.q, msg.r, msg.structure, client);
        return;
      case "demolish":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.demolish(player.id, msg.q, msg.r, client);
        return;
      case "mutate":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.mutate(player.id, msg.mutation, client);
        return;
      case "chooseStrain":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.chooseStrain(player.id, msg.strain, client);
        return;
      case "fructify":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.fructify(player.id, msg.radius, client);
        return;
      case "buySporeUpgrade":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.buySporeUpgrade(player.id, msg.upgrade, client);
        return;
      case "setAutomation":
        if (!player) return send(ws, { type: "actionError", error: "not_authenticated" });
        game.setAutomation(player.id, { colonize: msg.colonize, upgrades: msg.upgrades }, client);
        return;
    }
  });
  ws.on("close", () => {
    if (player) void game.detach(player.id, client);
  });
}

function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Too big: answer as invalid and discard the rest of the body.
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > maxBytes) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
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
