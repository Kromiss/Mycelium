/** Messages sent by the server over the WebSocket. */
export type ServerMessage =
  | { type: "welcome"; version: string; serverTime: number }
  | { type: "pong"; serverTime: number };

/** Messages sent by the client over the WebSocket. */
export type ClientMessage = { type: "ping" };

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  checks: Record<string, "ok" | "down" | "disabled">;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data === "object" && data !== null && (data as { type?: unknown }).type === "ping") {
      return { type: "ping" };
    }
    return null;
  } catch {
    return null;
  }
}
