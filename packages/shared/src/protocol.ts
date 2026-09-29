import { TERRAINS, type Terrain, type UpgradeId } from "./balance";
import { normalizeUpgrades, type ActionError, type GameState, type Tile } from "./game";
import { hexesInRadius, hexKey, type Hex } from "./hex";
import { START_HEX } from "./mapgen";

// ---------------------------------------------------------------------------
// Game state on the wire

/** A tile whose state differs from a fresh wild tile. */
export interface TileStateDto extends Hex {
  owned: boolean;
  growthEndsAt: number | null;
  growthStartedAt: number | null;
  exhaustion: number;
  disconnectedSince: number | null;
}

/** Full solo game state as sent to the client. */
export interface GameSnapshot {
  seed: number;
  radius: number;
  heart: Hex;
  heartMovedAt: number | null;
  /** One character per tile, in `hexesInRadius(START_HEX, radius)` order (see TERRAIN_CODES). */
  terrain: string;
  /** Owned, exhausted or withering tiles; every other tile is fresh and wild. */
  tiles: TileStateDto[];
  queue: Hex[];
  nutrients: number;
  biomass: number;
  upgrades: Record<UpgradeId, number>;
  lastSeenAt: number | null;
  updatedAt: number;
}

const TERRAIN_CODES: Record<Terrain, string> = { litter: "l", humus: "h", deadwood: "d", wetland: "w" };
const TERRAIN_BY_CODE = Object.fromEntries(TERRAINS.map((t) => [TERRAIN_CODES[t], t])) as Record<string, Terrain>;

export function toSnapshot(state: GameState): GameSnapshot {
  const cells = hexesInRadius(START_HEX, state.radius);
  const tiles: TileStateDto[] = [];
  for (const t of state.tiles.values()) {
    if (t.owned || t.exhaustion > 0 || t.disconnectedSince !== null) {
      tiles.push({
        q: t.q,
        r: t.r,
        owned: t.owned,
        growthEndsAt: t.growthEndsAt,
        growthStartedAt: t.growthStartedAt,
        exhaustion: t.exhaustion,
        disconnectedSince: t.disconnectedSince,
      });
    }
  }
  return {
    seed: state.seed,
    radius: state.radius,
    heart: { q: state.heart.q, r: state.heart.r },
    heartMovedAt: state.heartMovedAt,
    terrain: cells.map((c) => TERRAIN_CODES[state.tiles.get(hexKey(c))!.terrain]).join(""),
    tiles,
    queue: state.queue.map((h) => ({ q: h.q, r: h.r })),
    nutrients: state.nutrients,
    biomass: state.biomass,
    upgrades: { ...state.upgrades },
    lastSeenAt: state.lastSeenAt,
    updatedAt: state.updatedAt,
  };
}

export function fromSnapshot(s: GameSnapshot): GameState {
  const tiles = new Map<string, Tile>();
  hexesInRadius(START_HEX, s.radius).forEach((c, i) => {
    const terrain = TERRAIN_BY_CODE[s.terrain[i] ?? ""];
    if (!terrain) throw new Error(`Invalid terrain code at index ${i}`);
    tiles.set(hexKey(c), {
      q: c.q,
      r: c.r,
      terrain,
      owned: false,
      growthEndsAt: null,
      growthStartedAt: null,
      exhaustion: 0,
      disconnectedSince: null,
    });
  });
  for (const o of s.tiles) {
    const tile = tiles.get(hexKey(o));
    if (!tile) continue;
    tile.owned = o.owned;
    tile.growthEndsAt = o.growthEndsAt;
    tile.growthStartedAt = o.growthStartedAt ?? null;
    tile.exhaustion = o.exhaustion;
    tile.disconnectedSince = o.disconnectedSince;
  }
  return {
    seed: s.seed,
    radius: s.radius,
    heart: { q: s.heart.q, r: s.heart.r },
    heartMovedAt: s.heartMovedAt,
    nutrients: s.nutrients,
    biomass: s.biomass,
    upgrades: normalizeUpgrades(s.upgrades),
    queue: s.queue.map((h) => ({ q: h.q, r: h.r })),
    lastSeenAt: s.lastSeenAt,
    tiles,
    updatedAt: s.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// WebSocket messages

export interface PlayerInfo {
  id: string;
  name: string;
}

/** Messages sent by the server over the WebSocket. */
export type ServerMessage =
  | { type: "welcome"; version: string; serverTime: number }
  | { type: "pong"; serverTime: number }
  /** Answer to `auth`: the player and their full game, plus what happened while they were away. */
  | { type: "ready"; player: PlayerInfo; game: GameSnapshot; serverTime: number; away?: AwaySummary }
  | { type: "authError" }
  /** Sent every tick and after each action. */
  | { type: "state"; game: GameSnapshot; serverTime: number }
  | { type: "actionError"; error: ActionError | "not_authenticated" };

/** What the game produced while the player was away (shown when they come back). */
export interface AwaySummary {
  awayMs: number;
  nutrients: number;
  biomass: number;
  /** Tiles colonised from the expansion queue. */
  colonized: number;
}

/** Messages sent by the client over the WebSocket. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "auth"; token: string }
  /** Adds a tile to the expansion queue (starts right away if possible). */
  | { type: "colonize"; q: number; r: number }
  | { type: "unqueue"; q: number; r: number }
  | { type: "moveHeart"; q: number; r: number }
  | { type: "buyUpgrade"; upgrade: string };

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  checks: Record<string, "ok" | "down" | "disabled">;
}

// ---------------------------------------------------------------------------
// HTTP API

/** POST /api/guest — body. */
export interface GuestRequest {
  name: string;
}

/** POST /api/guest — 201 response. The token is kept by the browser and sent in `auth`. */
export interface GuestResponse {
  token: string;
  player: PlayerInfo;
}

export type GuestError = "invalid_name" | "name_taken";

/** Guest pseudos: 3 to 20 letters, digits, `_` or `-`. */
export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}_-]{3,20}$/u;

export function isValidPlayerName(name: string): boolean {
  return PLAYER_NAME_PATTERN.test(name);
}

// ---------------------------------------------------------------------------

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "ping":
      return { type: "ping" };
    case "auth":
      return isStr(m.token, 200) ? { type: "auth", token: m.token } : null;
    case "colonize":
    case "unqueue":
    case "moveHeart":
      return isInt(m.q) && isInt(m.r) ? { type: m.type, q: m.q, r: m.r } : null;
    case "buyUpgrade":
      return isStr(m.upgrade, 50) ? { type: "buyUpgrade", upgrade: m.upgrade } : null;
    default:
      return null;
  }
}
