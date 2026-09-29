import {
  advance,
  buyUpgrade,
  cloneGame,
  colonize,
  conversionRate,
  goOffline,
  goOnline,
  moveHeart,
  ownedCount,
  unqueue,
  type AwaySummary,
  isValidPlayerName,
  newGame,
  randomSeed,
  TICK_MS,
  toSnapshot,
  type ActionResult,
  type GameState,
  type GuestResponse,
  type PlayerInfo,
  type ServerMessage,
} from "@mycelium/shared";
import { createHash, randomBytes } from "node:crypto";
import { NameTakenError, type GameStore } from "./store";

/** Anything we can push server messages to (a WebSocket in production, a spy in tests). */
export interface GameClient {
  send(msg: ServerMessage): void;
}

export type GuestResult = { ok: true; response: GuestResponse } | { ok: false; error: "invalid_name" | "name_taken" };

interface ActiveGame {
  player: PlayerInfo;
  game: GameState;
  clients: Set<GameClient>;
  /** Saves run one after the other so an older state never overwrites a newer one. */
  saving: Promise<void>;
}

export interface GameServiceOptions {
  now?: () => number;
  tickMs?: number;
  log?: (msg: string) => void;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Authoritative solo simulation (GDD §12). Games of connected players are kept in memory,
 * advanced every tick, pushed to their clients and saved; they are unloaded when the last
 * client leaves. Loading a game catches it up to the current time.
 */
export class GameService {
  private readonly active = new Map<string, ActiveGame>();
  private readonly loading = new Map<string, Promise<ActiveGame | null>>();
  private timer: NodeJS.Timeout | undefined;
  private readonly now: () => number;
  private readonly tickMs: number;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly store: GameStore,
    options: GameServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.tickMs = options.tickMs ?? TICK_MS;
    this.log = options.log ?? ((msg) => console.error(`[game] ${msg}`));
  }

  start(): void {
    this.timer ??= setInterval(() => this.tick(), this.tickMs);
  }

  /** Stops ticking and waits for every game to be saved. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const entry of this.active.values()) {
      goOffline(entry.game, this.now());
      this.save(entry);
    }
    await Promise.all([...this.active.values()].map((e) => e.saving));
  }

  async createGuest(rawName: string): Promise<GuestResult> {
    const name = rawName.trim();
    if (!isValidPlayerName(name)) return { ok: false, error: "invalid_name" };
    const token = randomBytes(24).toString("base64url");
    try {
      const player = await this.store.createGuest(name, hashToken(token), newGame(randomSeed(), this.now()));
      return { ok: true, response: { token, player } };
    } catch (err) {
      if (err instanceof NameTakenError) return { ok: false, error: "name_taken" };
      throw err;
    }
  }

  authenticate(token: string): Promise<PlayerInfo | null> {
    return this.store.findPlayerByToken(hashToken(token));
  }

  /** Registers a client for the player's game and sends it the full state. */
  async attach(player: PlayerInfo, client: GameClient): Promise<boolean> {
    const entry = await this.load(player);
    if (!entry) return false;
    const now = this.now();
    let away: AwaySummary | undefined;
    if (entry.clients.size === 0) away = this.comeBack(entry.game, now);
    else advance(entry.game, now);
    entry.clients.add(client);
    client.send({ type: "ready", player: entry.player, game: toSnapshot(entry.game), serverTime: now, away });
    return true;
  }

  /** Unregisters a client; the game is saved and unloaded when nobody watches it any more. */
  async detach(playerId: string, client: GameClient): Promise<void> {
    const entry = this.active.get(playerId);
    if (!entry || !entry.clients.delete(client)) return;
    if (entry.clients.size > 0) return;
    goOffline(entry.game, this.now());
    this.save(entry);
    await entry.saving;
    // A new client may have arrived while saving.
    if (entry.clients.size === 0 && this.active.get(playerId) === entry) this.active.delete(playerId);
  }

  colonize(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (game, now) => colonize(game, { q, r }, now));
  }

  unqueue(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (game) => unqueue(game, { q, r }));
  }

  moveHeart(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (game, now) => moveHeart(game, { q, r }, now));
  }

  buyUpgrade(playerId: string, upgrade: string, client: GameClient): void {
    this.act(playerId, client, (game) => buyUpgrade(game, upgrade));
  }

  /** One simulation step for every active game. */
  tick(): void {
    const now = this.now();
    for (const entry of this.active.values()) {
      advance(entry.game, now);
      this.broadcast(entry);
      this.save(entry);
    }
  }

  /** For tests and diagnostics. */
  activeGame(playerId: string): GameState | undefined {
    return this.active.get(playerId)?.game;
  }

  /** Catches up the offline time (GDD §9) and switches back to full production. */
  private comeBack(game: GameState, now: number): AwaySummary | undefined {
    const since = game.lastSeenAt;
    const biomass = game.biomass;
    const tiles = ownedCount(game);
    goOnline(game, now);
    if (since === null || now <= since) return undefined;
    // No upgrade can be bought while away, so the conversion rate is constant over the absence.
    const gained = game.biomass - biomass;
    return {
      awayMs: now - since,
      nutrients: gained / conversionRate(game.upgrades),
      biomass: gained,
      colonized: ownedCount(game) - tiles,
    };
  }

  private act(
    playerId: string,
    client: GameClient,
    action: (game: GameState, now: number) => ActionResult,
  ): void {
    const entry = this.active.get(playerId);
    if (!entry || !entry.clients.has(client)) {
      client.send({ type: "actionError", error: "not_authenticated" });
      return;
    }
    const now = this.now();
    advance(entry.game, now);
    const result = action(entry.game, now);
    if (!result.ok) {
      client.send({ type: "actionError", error: result.error });
      return;
    }
    this.broadcast(entry);
    this.save(entry);
  }

  private broadcast(entry: ActiveGame): void {
    const msg: ServerMessage = { type: "state", game: toSnapshot(entry.game), serverTime: this.now() };
    for (const c of entry.clients) c.send(msg);
  }

  private save(entry: ActiveGame): void {
    const copy = cloneGame(entry.game);
    entry.saving = entry.saving
      .then(() => this.store.saveGame(entry.player.id, copy))
      .catch((err: unknown) => this.log(`save failed for ${entry.player.id}: ${String(err)}`));
  }

  private async load(player: PlayerInfo): Promise<ActiveGame | null> {
    const existing = this.active.get(player.id);
    if (existing) return existing;
    let pending = this.loading.get(player.id);
    if (!pending) {
      pending = this.store
        .loadGame(player.id)
        .then((game) => {
          if (!game) return null;
          // Saved while online (e.g. the server stopped abruptly): count the absence from the last save.
          game.lastSeenAt ??= game.updatedAt;
          const entry: ActiveGame = { player, game, clients: new Set(), saving: Promise.resolve() };
          this.active.set(player.id, entry);
          return entry;
        })
        .finally(() => this.loading.delete(player.id));
      this.loading.set(player.id, pending);
    }
    return pending;
  }
}
