import { ACTION_IDS, RELIC_IDS, TERRAINS, type RelicId, type ActionId, type EventKind, type MutationId, type StrainId, type StructureId, type Terrain, type UpgradeId } from "./balance";
import {
  isMutationId,
  isStrainId,
  isStructureId,
  normalizeAutomation,
  normalizeSporeUpgrades,
  normalizeUpgrades,
  type ActionError,
  type Automation,
  type GameState,
  type SporeUpgrades,
  type Tile,
  type TileEffect,
} from "./game";
import type { MapLayout } from "./forestgen";
import type { EventDto, EventNotice } from "./events";
import { CHAT, CHAT_CHANNELS, isPushKind, type ChatChannel, type ChatError, type ChatMessage, type PushKind, type PushLang } from "./chat";
import { hexKey, type Hex } from "./hex";
import type { PactEvent } from "./social";

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
  /** Structure (GDD §4.1), omitted when there is none. */
  s?: StructureId;
  /** Poisoned by a neighbour's Toxines (GDD §4.2), omitted when not. */
  x?: 1;
  /** Timed effects (actions, events), omitted when there are none. */
  e?: TileEffect[];
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
  strain: StrainId | null;
  mutations: MutationId[];
  spores: number;
  sporeUpgrades: SporeUpgrades;
  fruitings: number;
  automation: Automation;
  heart: Hex;
  heartMovedAt: number | null;
  heartShieldUntil: number | null;
  cooldowns: Partial<Record<ActionId, number>>;
  /** Visible tiles only (GDD §2.1 fog); the rest of the forest is unknown to the client. */
  tiles: TileDto[];
  queue: Hex[];
  nutrients: number;
  enzymes: number;
  enzymesUnlocked: boolean;
  biomass: number;
  upgrades: Record<UpgradeId, number>;
  lastSeenAt: number | null;
  updatedAt: number;
  /** M7 social state (see GameState). */
  pact?: string | null;
  allies?: string[];
  taintedUntil?: number | null;
  signals?: number;
  signalsUnlocked?: boolean;
  relics?: RelicId[];
  relicPicks?: number;
  listens?: Record<string, number>;
}

export const TERRAIN_CODES: Record<Terrain, string> = {
  litter: "l",
  humus: "h",
  deadwood: "d",
  wetland: "w",
  stump: "s",
  roots: "r",
  rock: "k",
  acid: "a",
  carcass: "c",
  tree: "t",
  ruin: "u",
  rubble: "b",
};
const TERRAIN_BY_CODE = Object.fromEntries(TERRAINS.map((t) => [TERRAIN_CODES[t], t])) as Record<string, Terrain>;

/** Snapshot of a player's game; `visible` limits the tiles sent (all tiles when omitted). */
export function toSnapshot(state: GameState, visible?: Set<string>): GameSnapshot {
  const tiles: TileDto[] = [];
  for (const [k, t] of state.tiles) {
    if (visible && !visible.has(k)) continue;
    const dto: TileDto = {
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
    };
    if (t.structure !== null) dto.s = t.structure;
    if (t.toxic) dto.x = 1;
    if (t.effects.length > 0) dto.e = t.effects.map((e) => ({ ...e }));
    tiles.push(dto);
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
    strain: state.strain,
    mutations: [...state.mutations],
    spores: state.spores,
    sporeUpgrades: { ...state.sporeUpgrades },
    fruitings: state.fruitings,
    automation: { ...state.automation },
    heart: { q: state.heart.q, r: state.heart.r },
    heartMovedAt: state.heartMovedAt,
    heartShieldUntil: state.heartShieldUntil,
    cooldowns: { ...state.cooldowns },
    tiles,
    queue: state.queue.map((h) => ({ q: h.q, r: h.r })),
    nutrients: state.nutrients,
    enzymes: state.enzymes,
    enzymesUnlocked: state.enzymesUnlocked,
    biomass: state.biomass,
    upgrades: { ...state.upgrades },
    lastSeenAt: state.lastSeenAt,
    updatedAt: state.updatedAt,
    pact: state.pact,
    allies: [...state.allies],
    taintedUntil: state.taintedUntil,
    signals: state.signals,
    signalsUnlocked: state.signalsUnlocked,
    relics: [...state.relics],
    relicPicks: state.relicPicks,
    listens: { ...state.listens },
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
      structure: typeof o.s === "string" && isStructureId(o.s) ? o.s : null,
      toxic: o.x === 1,
      effects: normalizeEffects(o.e),
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
    strain: typeof s.strain === "string" && isStrainId(s.strain) ? s.strain : null,
    mutations: Array.isArray(s.mutations) ? s.mutations.filter((m) => typeof m === "string" && isMutationId(m)) : [],
    spores: s.spores ?? 0,
    sporeUpgrades: normalizeSporeUpgrades(s.sporeUpgrades),
    fruitings: s.fruitings ?? 0,
    automation: normalizeAutomation(s.automation),
    heart: { q: s.heart.q, r: s.heart.r },
    heartMovedAt: s.heartMovedAt,
    heartShieldUntil: s.heartShieldUntil ?? null,
    cooldowns: normalizeCooldowns(s.cooldowns),
    siphoned: {},
    nutrients: s.nutrients,
    enzymes: s.enzymes ?? 0,
    enzymesUnlocked: s.enzymesUnlocked ?? false,
    biomass: s.biomass,
    upgrades: normalizeUpgrades(s.upgrades),
    queue: s.queue.map((h) => ({ q: h.q, r: h.r })),
    lastSeenAt: s.lastSeenAt,
    pact: typeof s.pact === "string" ? s.pact : null,
    allies: Array.isArray(s.allies) ? s.allies.filter((a) => typeof a === "string") : [],
    pactGiven: 0,
    taintedUntil: typeof s.taintedUntil === "number" ? s.taintedUntil : null,
    signals: s.signals ?? 0,
    signalsUnlocked: s.signalsUnlocked ?? false,
    relics: normalizeRelics(s.relics),
    relicPicks: s.relicPicks ?? 0,
    listens: normalizeListens(s.listens),
    tiles,
    updatedAt: s.updatedAt,
  };
}

/** Relics from untrusted data. */
export function normalizeRelics(raw: unknown): RelicId[] {
  return Array.isArray(raw) ? [...new Set(raw.filter((r): r is RelicId => typeof r === "string" && (RELIC_IDS as readonly string[]).includes(r)))] : [];
}

/** Listened networks from untrusted data. */
export function normalizeListens(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw === "object" && raw !== null) for (const [id, until] of Object.entries(raw)) if (typeof until === "number") out[id] = until;
  return out;
}

const EFFECT_KINDS: readonly string[] = [...ACTION_IDS, "storm", "ashes"];

/** Tile effects from untrusted data. */
export function normalizeEffects(raw: unknown): TileEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is TileEffect =>
        typeof e === "object" && e !== null && EFFECT_KINDS.includes(e.kind) && typeof e.by === "string" && typeof e.until === "number",
    )
    .map((e) => (typeof e.power === "number" ? { kind: e.kind, by: e.by, until: e.until, power: e.power } : { kind: e.kind, by: e.by, until: e.until }));
}

/** Action cooldowns from untrusted data. */
export function normalizeCooldowns(raw: unknown): Partial<Record<ActionId, number>> {
  const out: Partial<Record<ActionId, number>> = {};
  if (typeof raw === "object" && raw !== null) {
    for (const [id, at] of Object.entries(raw)) if ((ACTION_IDS as readonly string[]).includes(id) && typeof at === "number") out[id as ActionId] = at;
  }
  return out;
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
  /** Tiles the player owns (GDD §6.4: attacking a much smaller player costs more; floor of tiles). */
  tiles: number;
  /** In the viewer's pact (M7). */
  ally?: true;
  /** "Réseau tâché": betrayed a pact less than a day ago (M7, visible to everybody). */
  tainted?: true;
}

/** The viewer's pact and invitations (M7). */
export interface SocialView {
  pact: {
    id: string;
    members: string[];
    /** Members leaving with notice: when they leave. */
    leaving: Record<string, number>;
    createdAt: number;
    /** Biomass the members earned in the pact (alliance leaderboard). */
    score: number;
  } | null;
  invitesIn: Array<{ from: string; at: number }>;
  invitesOut: Array<{ to: string; at: number }>;
}

/** A pact in the alliance leaderboard (M7): its members' names, current ones first. */
export interface AllianceEntry {
  rank: number;
  id: string;
  members: string[];
  score: number;
  /** Still alive (not fallen under two members). */
  active: boolean;
}

/** A member of the forest, for the chat and private messages (everybody, fog or not). */
export interface RosterEntry {
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
  /** Alliance leaderboard of the forest (M7). */
  alliances: AllianceEntry[];
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
      /** Events announced or under way in the forest (GDD §7). */
      forestEvents: EventDto[];
      /** Every colony of the forest (M7 chat). */
      roster: RosterEntry[];
      /** Recent messages this player can read, oldest first. */
      chat: ChatMessage[];
      /** Players this player muted. */
      muted: string[];
      /** An admin cut this player's chat until then (game time), or null. */
      silencedUntil: number | null;
      /** The player may cut other players' chat (M7 moderation). */
      admin: boolean;
      social: SocialView;
    }
  /** The forest's colonies changed (someone joined). */
  | { type: "roster"; roster: RosterEntry[] }
  /** A new message this player can read. */
  | { type: "chat"; message: ChatMessage }
  | { type: "chatError"; error: ChatError }
  /** Moderation done: a message reported, a player silenced. */
  | { type: "chatNotice"; notice: "reported" | "silenced"; name?: string }
  /** The season is over and the forest was wiped: `result` is the final standing (null if absent). */
  | { type: "seasonEnded"; result: SeasonResult | null }
  | { type: "authError" }
  /** Sent every tick and after each action. `events` lists this player's lost and won tiles. */
  | {
      type: "state";
      game: GameSnapshot;
      owners: OwnerInfo[];
      serverTime: number;
      events: CaptureNotice[];
      /** Events announced or under way (GDD §7), and what they did to this player since the last state. */
      forestEvents: EventDto[];
      eventNotices: EventNotice[];
      /** In-game alerts for this player since the last state (GDD §11). */
      alerts: Alert[];
      social: SocialView;
    }
  | { type: "leaderboard"; leaderboard: Leaderboard }
  | { type: "actionError"; error: ActionError | "not_authenticated" };

export interface CaptureNotice {
  q: number;
  r: number;
  /** Won: this player took the tile; lost: someone took it from them. */
  kind: "won" | "lost";
  other: string;
  /** The tile was the loser's Cœur. */
  heart?: true;
}

/** In-game alerts (GDD §11): a border fight starts on one of your tiles, an action hits you. */
export type Alert =
  | { type: "attacked"; by: string; q: number; r: number; heart?: true }
  | { type: "action"; action: ActionId; by: string; q: number; r: number }
  /** M7: a pact invitation, a newcomer, a departure, a betrayal… `by` is who did it. */
  | { type: "pact"; event: PactEvent["kind"]; by: string };

/** One line of the night journal (GDD §11 "Journal de la nuit"); names are resolved by the server. */
export type JournalLine =
  | { type: "lostTo"; name: string; tiles: number }
  | { type: "wonFrom"; name: string; tiles: number }
  | { type: "heartLost"; name: string }
  | { type: "action"; action: ActionId; name: string; count: number }
  | { type: "event"; kind: EventKind; tiles: number; biomass: number; enzymes: number; trophy: boolean }
  | { type: "pact"; event: PactEvent["kind"]; name: string };

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
  /** What happened, by neighbour and by event (M6). */
  journal: JournalLine[];
}

/** Messages sent by the client over the WebSocket. */
export type ClientMessage =
  | { type: "ping" }
  | { type: "auth"; token: string }
  /** Adds a tile to the expansion queue (starts right away if possible). */
  | { type: "colonize"; q: number; r: number }
  | { type: "unqueue"; q: number; r: number }
  | { type: "moveHeart"; q: number; r: number }
  | { type: "buyUpgrade"; upgrade: string }
  /** Builds a structure on one of the player's tiles (GDD §4.1). */
  | { type: "build"; q: number; r: number; structure: string }
  | { type: "demolish"; q: number; r: number }
  /** Takes a mutation (GDD §4.2). */
  | { type: "mutate"; mutation: string }
  /** Picks the season's strain (GDD §4.3). */
  | { type: "chooseStrain"; strain: string }
  /** Fruits, keeping the tiles within `radius` of the Cœur (GDD §5). */
  | { type: "fructify"; radius: number }
  | { type: "buySporeUpgrade"; upgrade: string }
  /** Switches automations (GDD §9). */
  | { type: "setAutomation"; colonize?: string | null; upgrades?: boolean }
  /** Uses an active action on an enemy tile (GDD §6.2). */
  | { type: "act"; action: string; q: number; r: number }
  /** Sends a message to the forest, to the player's pact, or to one player (`to`). */
  | { type: "chat"; channel: ChatChannel; to?: string; text: string }
  | { type: "mute"; player: string; muted: boolean }
  | { type: "report"; message: number }
  /** Admins only: cuts a player's chat for a day. */
  | { type: "silence"; player: string }
  /** Browser notifications (M7): the subscription made by the browser, the language and the kinds wanted. */
  | { type: "pushSubscribe"; endpoint: string; p256dh: string; auth: string; lang: PushLang; kinds: PushKind[] }
  | { type: "pushUnsubscribe"; endpoint: string }
  /** Pactes de symbiose (M7). */
  | { type: "pactInvite"; to: string }
  | { type: "pactAnswer"; from: string; accept: boolean }
  /** Leaves with an hour of notice. */
  | { type: "pactLeave" }
  /** Breaks the pact at once (betrayal). */
  | { type: "pactBetray" }
  /** Sends Nutrients or Enzymes to an ally, for a Signal. */
  | { type: "send"; to: string; resource: "nutrients" | "enzymes"; amount: number }
  /** Listens to a colony's network for an hour. */
  | { type: "listen"; target: string }
  | { type: "chooseRelic"; relic: string };

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
    case "demolish":
      return isInt(m.q) && isInt(m.r) ? { type: m.type, q: m.q, r: m.r } : null;
    case "build":
      return isInt(m.q) && isInt(m.r) && isStr(m.structure, 50) ? { type: "build", q: m.q, r: m.r, structure: m.structure } : null;
    case "buyUpgrade":
      return isStr(m.upgrade, 50) ? { type: "buyUpgrade", upgrade: m.upgrade } : null;
    case "mutate":
      return isStr(m.mutation, 50) ? { type: "mutate", mutation: m.mutation } : null;
    case "chooseStrain":
      return isStr(m.strain, 50) ? { type: "chooseStrain", strain: m.strain } : null;
    case "fructify":
      return isInt(m.radius) ? { type: "fructify", radius: m.radius } : null;
    case "buySporeUpgrade":
      return isStr(m.upgrade, 50) ? { type: "buySporeUpgrade", upgrade: m.upgrade } : null;
    case "act":
      return isStr(m.action, 20) && isInt(m.q) && isInt(m.r) ? { type: "act", action: m.action, q: m.q, r: m.r } : null;
    case "chat": {
      if (typeof m.channel !== "string" || !(CHAT_CHANNELS as readonly string[]).includes(m.channel)) return null;
      // Room for the characters cleaning removes; the length rule itself is checked on the cleaned text.
      if (!isStr(m.text, CHAT.maxLength * 4)) return null;
      const channel = m.channel as ChatChannel;
      if (channel === "dm") return isStr(m.to, 64) ? { type: "chat", channel, to: m.to, text: m.text } : null;
      return { type: "chat", channel, text: m.text };
    }
    case "mute":
      return isStr(m.player, 64) && typeof m.muted === "boolean" ? { type: "mute", player: m.player, muted: m.muted } : null;
    case "report":
      return isInt(m.message) && m.message > 0 ? { type: "report", message: m.message } : null;
    case "silence":
      return isStr(m.player, 64) ? { type: "silence", player: m.player } : null;
    case "pushSubscribe": {
      if (!isStr(m.endpoint, 1000) || !/^https:\/\//.test(m.endpoint) || !isStr(m.p256dh, 200) || !isStr(m.auth, 100)) return null;
      if (m.lang !== "en" && m.lang !== "fr") return null;
      if (!Array.isArray(m.kinds) || m.kinds.length > 10) return null;
      const kinds = [...new Set(m.kinds.filter(isPushKind))];
      return { type: "pushSubscribe", endpoint: m.endpoint, p256dh: m.p256dh, auth: m.auth, lang: m.lang, kinds };
    }
    case "pushUnsubscribe":
      return isStr(m.endpoint, 1000) ? { type: "pushUnsubscribe", endpoint: m.endpoint } : null;
    case "pactInvite":
      return isStr(m.to, 64) ? { type: "pactInvite", to: m.to } : null;
    case "pactAnswer":
      return isStr(m.from, 64) && typeof m.accept === "boolean" ? { type: "pactAnswer", from: m.from, accept: m.accept } : null;
    case "pactLeave":
    case "pactBetray":
      return { type: m.type };
    case "send":
      if (!isStr(m.to, 64) || (m.resource !== "nutrients" && m.resource !== "enzymes")) return null;
      return typeof m.amount === "number" && Number.isFinite(m.amount) && m.amount > 0 ? { type: "send", to: m.to, resource: m.resource, amount: m.amount } : null;
    case "listen":
      return isStr(m.target, 64) ? { type: "listen", target: m.target } : null;
    case "chooseRelic":
      return isStr(m.relic, 20) ? { type: "chooseRelic", relic: m.relic } : null;
    case "setAutomation": {
      const out: ClientMessage = { type: "setAutomation" };
      if (m.colonize === null || isStr(m.colonize, 20)) out.colonize = m.colonize as string | null;
      else if (m.colonize !== undefined) return null;
      if (typeof m.upgrades === "boolean") out.upgrades = m.upgrades;
      else if (m.upgrades !== undefined) return null;
      return out;
    }
    default:
      return null;
  }
}
