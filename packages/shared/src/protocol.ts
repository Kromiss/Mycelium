import { TERRAINS, type Terrain, type UpgradeId } from "./balance";
import { normalizeUpgrades, type ActionError, type GameState, type Tile } from "./game";
import { hexesInRadius, hexKey, type Hex } from "./hex";
import { START_HEX } from "./mapgen";

// ---------------------------------------------------------------------------
// Game state on the wire

export interface OwnedTileDto extends Hex {
  growthEndsAt: number | null;
  growthStartedAt: number | null;
}

/** Full solo game state as sent to the client. */
export interface GameSnapshot {
  seed: number;
  radius: number;
  heart: Hex;
  /** One character per tile, in `hexesInRadius(START_HEX, radius)` order (see TERRAIN_CODES). */
  terrain: string;
  owned: OwnedTileDto[];
  nutrients: number;
  biomass: number;
  upgrades: Record<UpgradeId, number>;
  updatedAt: number;
}

const TERRAIN_CODES: Record<Terrain, string> = { litter: "l", humus: "h", deadwood: "d" };
const TERRAIN_BY_CODE = Object.fromEntries(TERRAINS.map((t) => [TERRAIN_CODES[t], t])) as Record<string, Terrain>;

export function toSnapshot(state: GameState): GameSnapshot {
  const cells = hexesInRadius(START_HEX, state.radius);
  const owned: OwnedTileDto[] = [];
  for (const t of state.tiles.values()) if (t.owned) owned.push({ q: t.q, r: t.r, growthEndsAt: t.growthEndsAt, growthStartedAt: t.growthStartedAt });
  return {
    seed: state.seed,
    radius: state.radius,
    heart: { q: state.heart.q, r: state.heart.r },
    terrain: cells.map((c) => TERRAIN_CODES[state.tiles.get(hexKey(c))!.terrain]).join(""),
    owned,
    nutrients: state.nutrients,
    biomass: state.biomass,
    upgrades: { ...state.upgrades },
    updatedAt: state.updatedAt,
  };
}

export function fromSnapshot(s: GameSnapshot): GameState {
  const tiles = new Map<string, Tile>();
  hexesInRadius(START_HEX, s.radius).forEach((c, i) => {
    const terrain = TERRAIN_BY_CODE[s.terrain[i] ?? ""];
    if (!terrain) throw new Error(`Invalid terrain code at index ${i}`);
    tiles.set(hexKey(c), { q: c.q, r: c.r, terrain, owned: false, growthEndsAt: null, growthStartedAt: null });
  });
  for (const o of s.owned) {
    const tile = tiles.get(hexKey(o));
    if (tile) {
      tile.owned = true;
      tile.growthEndsAt = o.growthEndsAt;
      tile.growthStartedAt = o.growthStartedAt ?? null;
    }
  }
  const upgrades = normalizeUpgrades(s.upgrades);
  return {
    seed: s.seed,
    radius: s.radius,
    heart: s.heart,
    nutrients: s.nutrients,
    biomass: s.biomass,
    upgrades,
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
  /** Answer to `auth`: the player and their full game. */
  | { type: "ready"; player: PlayerInfo; game: GameSnapshot; serverTime: number }
  | { type: "authError" }
  /** Sent every tick and after each action. */
  | { type: "state"; game: GameSnapshot; serverTime: number }
  | { type: "actionError"; error: ActionError | "not_authenticated" };

/** Messages sent by the client over the WebSocket. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "auth"; token: string }
  | { type: "colonize"; q: number; r: number }
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
      return isInt(m.q) && isInt(m.r) ? { type: "colonize", q: m.q, r: m.r } : null;
    case "buyUpgrade":
      return isStr(m.upgrade, 50) ? { type: "buyUpgrade", upgrade: m.upgrade } : null;
    default:
      return null;
  }
}
