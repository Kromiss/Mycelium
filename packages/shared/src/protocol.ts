import { TERRAINS, type Terrain, type UpgradeId } from "./balance";
import { normalizeUpgrades, type ActionError, type GameState, type Tile } from "./game";
import type { MapLayout } from "./forestgen";
import { hexKey, type Hex } from "./hex";

// ---------------------------------------------------------------------------
// Game state on the wire

/** A tile as a player sees it. */
export interface TileDto extends Hex {
  /** Terrain code, see TERRAIN_CODES. */
  t: string;
  owner: string | null;
  growthEndsAt: number | null;
  growthStartedAt: number | null;
  exhaustion: number;
  disconnectedSince: number | null;
  capture: { by: string; progress: number } | null;
  reservedFor: string | null;
}

/** A player's game as sent to them: their own economy, and the tiles they can see. */
export interface GameSnapshot {
  id: string;
  radius: number;
  layout: MapLayout;
  spawn: Hex;
  joinedAt: number;
  trophies: number;
  calendar: boolean;
  mondayBonus: number;
  heart: Hex;
  heartMovedAt: number | null;
  /** Visible tiles only (GDD §2.1 fog); the rest of the forest is unknown to the client. */
  tiles: TileDto[];
  queue: Hex[];
  nutrients: number;
  biomass: number;
  upgrades: Record<UpgradeId, number>;
  lastSeenAt: number | null;
  updatedAt: number;
}

export const TERRAIN_CODES: Record<Terrain, string> = { litter: "l", humus: "h", deadwood: "d", wetland: "w" };
const TERRAIN_BY_CODE = Object.fromEntries(TERRAINS.map((t) => [TERRAIN_CODES[t], t])) as Record<string, Terrain>;

/** Snapshot of a player's game; `visible` limits the tiles sent (all tiles when omitted). */
export function toSnapshot(state: GameState, visible?: Set<string>): GameSnapshot {
  const tiles: TileDto[] = [];
  for (const [k, t] of state.tiles) {
    if (visible && !visible.has(k)) continue;
    tiles.push({
      q: t.q,
      r: t.r,
      t: TERRAIN_CODES[t.terrain],
      owner: t.owner,
      growthEndsAt: t.growthEndsAt,
      growthStartedAt: t.growthStartedAt,
      exhaustion: t.exhaustion,
      disconnectedSince: t.disconnectedSince,
      capture: t.capture && { ...t.capture },
      reservedFor: t.reservedFor,
    });
  }
  return {
    id: state.id,
    radius: state.radius,
    layout: state.layout,
    spawn: { q: state.spawn.q, r: state.spawn.r },
    joinedAt: state.joinedAt,
    trophies: state.trophies,
    calendar: state.calendar,
    mondayBonus: state.mondayBonus,
    heart: { q: state.heart.q, r: state.heart.r },
    heartMovedAt: state.heartMovedAt,
    tiles,
    queue: state.queue.map((h) => ({ q: h.q, r: h.r })),
    nutrients: state.nutrients,
    biomass: state.biomass,
    upgrades: { ...state.upgrades },
    lastSeenAt: state.lastSeenAt,
    updatedAt: state.updatedAt,
  };
}

/** Rebuilds a player's game from a snapshot; `tiles` holds only what the snapshot carried. */
export function fromSnapshot(s: GameSnapshot, seed = 0): GameState {
  const tiles = new Map<string, Tile>();
  for (const o of s.tiles) {
    const terrain = TERRAIN_BY_CODE[o.t];
    if (!terrain) throw new Error(`Invalid terrain code ${o.t}`);
    tiles.set(hexKey(o), {
      q: o.q,
      r: o.r,
      terrain,
      owner: o.owner,
      growthEndsAt: o.growthEndsAt,
      growthStartedAt: o.growthStartedAt ?? null,
      exhaustion: o.exhaustion,
      disconnectedSince: o.disconnectedSince,
      capture: o.capture && { ...o.capture },
      reservedFor: o.reservedFor ?? null,
    });
  }
  return {
    id: s.id,
    seed,
    radius: s.radius,
    layout: s.layout,
    spawn: { q: s.spawn.q, r: s.spawn.r },
    joinedAt: s.joinedAt,
    trophies: s.trophies,
    calendar: s.calendar ?? false,
    mondayBonus: s.mondayBonus ?? 0,
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

/** Another player, as shown on the map and in the leaderboard. */
export interface OwnerInfo {
  id: string;
  name: string;
  /** Index in the client's player palette. */
  color: number;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  /** Score: cumulated biomass (GDD §8.1). */
  biomass: number;
  trophies: number;
  tiles: number;
}

/** GDD §8.1 and §11: forest ranking (top and the player's surroundings) and global position. */
export interface Leaderboard {
  top: LeaderboardEntry[];
  /** The player and up to two players above and below. */
  around: LeaderboardEntry[];
  rank: number;
  players: number;
  global: { rank: number; players: number };
}

export interface ForestInfo {
  id: string;
  number: number;
  capacity: number;
  players: number;
  /** Season the forest belongs to (Monday 00:00 Paris); it is wiped at the end of that week. */
  seasonStart: number;
}

/** A finished season, as kept after the wipe (GDD §8.2 "Historique de saison"). */
export interface SeasonResult {
  seasonStart: number;
  /** ISO week and year, e.g. "Semaine 38". */
  week: number;
  year: number;
  forestNumber: number;
  rank: number;
  players: number;
  biomass: number;
  trophies: number;
  tiles: number;
  /** The forest's map seed, published once the season is over (GDD §12). */
  seed: number;
}

/** Messages sent by the server over the WebSocket. */
export type ServerMessage =
  | { type: "welcome"; version: string; serverTime: number }
  | { type: "pong"; serverTime: number }
  /** Answer to `auth`: the player and their game, plus what happened while they were away. */
  | {
      type: "ready";
      player: PlayerInfo;
      forest: ForestInfo;
      game: GameSnapshot;
      owners: OwnerInfo[];
      serverTime: number;
      /** Game time runs this many times faster than real time (1 in production). */
      timeScale: number;
      away?: AwaySummary;
      /** Account created as a guest (M1–M2): it should choose a password. */
      needsPassword: boolean;
      /** Previous seasons of this player, most recent first. */
      history: SeasonResult[];
    }
  /** The season is over and the forest was wiped: `result` is the final standing (null if absent). */
  | { type: "seasonEnded"; result: SeasonResult | null }
  | { type: "authError" }
  /** Sent every tick and after each action. `events` lists this player's lost and won tiles. */
  | { type: "state"; game: GameSnapshot; owners: OwnerInfo[]; serverTime: number; events: CaptureNotice[] }
  | { type: "leaderboard"; leaderboard: Leaderboard }
  | { type: "actionError"; error: ActionError | "not_authenticated" };

export interface CaptureNotice {
  q: number;
  r: number;
  /** Won: this player took the tile; lost: someone took it from them. */
  kind: "won" | "lost";
  other: string;
}

/** What the game produced while the player was away (shown when they come back). */
export interface AwaySummary {
  awayMs: number;
  nutrients: number;
  biomass: number;
  /** Tiles colonised from the expansion queue. */
  colonized: number;
  /** Tiles taken from neighbours, and lost to them. */
  won: number;
  lost: number;
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

/** POST /api/register and POST /api/login — body. */
export interface Credentials {
  name: string;
  password: string;
}

/** 200 / 201 response of register and login. The token is kept by the browser and sent in `auth`. */
export interface SessionResponse {
  token: string;
  player: PlayerInfo;
}

export type AuthError = "invalid_name" | "name_taken" | "weak_password" | "wrong_credentials" | "too_many_attempts";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

/** Pseudos: 3 to 20 letters, digits, `_` or `-`. */
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
