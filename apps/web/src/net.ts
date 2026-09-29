import type { AuthError, ClientMessage, ServerMessage, SessionResponse } from "@mycelium/shared";

const TOKEN_KEY = "mycelium.guestToken";

/** The session token (or the guest token of an M1–M2 account) lives in this browser. */
export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Without storage the player will have to create a new guest on reload.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

export async function signIn(
  kind: "login" | "register",
  name: string,
  password: string,
): Promise<{ ok: true; session: SessionResponse } | { ok: false; error: AuthError | "network" }> {
  try {
    const res = await fetch(`/api/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (res.ok) return { ok: true, session: (await res.json()) as SessionResponse };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const known: AuthError[] = ["invalid_name", "name_taken", "weak_password", "wrong_credentials", "too_many_attempts"];
    return { ok: false, error: known.includes(body.error as AuthError) ? (body.error as AuthError) : "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Sets the password of an account created as a guest. */
export async function choosePassword(token: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/password", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function signOut(token: string): Promise<void> {
  try {
    await fetch("/api/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  } catch {
    // Signing out locally is enough if the server is unreachable.
  }
}

export interface ConnectionHandlers {
  onMessage(msg: ServerMessage): void;
  onStatus(connected: boolean): void;
}

/** WebSocket to the game server that re-authenticates after every reconnection. */
export class Connection {
  private ws: WebSocket | null = null;
  private stopped = false;
  private retryMs = 1000;

  constructor(
    private readonly token: string,
    private readonly handlers: ConnectionHandlers,
  ) {}

  start(): void {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${location.host}/ws`);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.retryMs = 1000;
      this.send({ type: "auth", token: this.token });
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      if (msg.type === "ready") this.handlers.onStatus(true);
      this.handlers.onMessage(msg);
    });
    ws.addEventListener("close", () => {
      if (this.ws !== ws) return;
      this.handlers.onStatus(false);
      if (this.stopped) return;
      setTimeout(() => this.start(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 15_000);
    });
  }

  stop(): void {
    this.stopped = true;
    this.ws?.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
