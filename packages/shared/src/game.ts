import {
  ECONOMY,
  EXHAUSTION,
  HEART_MOVE_COOLDOWN_MS,
  HUMIDITY,
  OFFLINE,
  QUEUE_MAX,
  TERRAIN_STATS,
  TICK_MS,
  TRANSPORT,
  UPGRADE_IDS,
  UPGRADE_STATS,
  type Terrain,
  type UpgradeId,
} from "./balance";
import { hexDistance, hexEquals, hexKey, hexNeighbors, type Hex } from "./hex";
import { generateMap, START_HEX } from "./mapgen";

/**
 * Solo game rules (GDD §2.3, §2.4, §3, §9, §10). The functions here are the single source of
 * truth: the server runs them with authority, the client runs them to display predictions.
 */

export interface Tile extends Hex {
  /** Mutable: exhausted Dead wood turns into Humus. */
  terrain: Terrain;
  /** Colonised by the player (possibly still growing). */
  owned: boolean;
  /** When owned: end of the hyphae growth (ms since epoch), or null once the tile is colonised. */
  growthEndsAt: number | null;
  /** When growing: start of the hyphae growth (ms since epoch); null otherwise or if unknown. */
  growthStartedAt: number | null;
  /** 0 (fresh) to EXHAUSTION.max. Grows while the tile produces, recovers while it rests. */
  exhaustion: number;
  /** When an owned tile lost its link to the Cœur (ms since epoch), null while connected. */
  disconnectedSince: number | null;
}

export type Upgrades = Record<UpgradeId, number>;

export interface GameState {
  readonly seed: number;
  readonly radius: number;
  /** The Cœur: nutrients flow to it (GDD §2.4). */
  heart: Hex;
  /** Last time the Cœur was moved, null if never. */
  heartMovedAt: number | null;
  nutrients: number;
  /** Cumulated biomass: the leaderboard score (GDD §3, §5). */
  biomass: number;
  upgrades: Upgrades;
  /** Expansion queue (GDD §9): tiles to colonise next, in order. */
  queue: Hex[];
  /** When the player left (no client connected), null while they play. Drives offline production. */
  lastSeenAt: number | null;
  /** Every tile of the map, keyed by `hexKey`. */
  readonly tiles: Map<string, Tile>;
  /** Time up to which the game has been simulated (ms since epoch). */
  updatedAt: number;
}

export type ActionError =
  | "unknown_tile"
  | "impassable"
  | "already_owned"
  | "already_queued"
  | "queue_full"
  | "not_queued"
  | "not_adjacent"
  | "not_enough_nutrients"
  | "unknown_upgrade"
  | "not_connected"
  | "heart_cooldown";

export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export function emptyUpgrades(): Upgrades {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Upgrades;
}

/** Upgrade levels from untrusted data: unknown ids dropped, missing or invalid levels at 0. */
export function normalizeUpgrades(raw: unknown): Upgrades {
  const out = emptyUpgrades();
  if (typeof raw === "object" && raw !== null) {
    for (const [id, level] of Object.entries(raw)) {
      if (isUpgradeId(id) && Number.isInteger(level) && (level as number) >= 0) out[id] = level as number;
    }
  }
  return out;
}

export function isUpgradeId(id: string): id is UpgradeId {
  return (UPGRADE_IDS as readonly string[]).includes(id);
}

/** A fresh solo game: the start tile is colonised, everything else is wild. */
export function newGame(seed: number, now: number, radius?: number): GameState {
  const map = generateMap(seed, radius);
  const tiles = new Map<string, Tile>();
  for (const t of map.tiles) {
    const isStart = hexEquals(t, START_HEX);
    tiles.set(hexKey(t), {
      q: t.q,
      r: t.r,
      terrain: t.terrain,
      owned: isStart,
      growthEndsAt: null,
      growthStartedAt: null,
      exhaustion: 0,
      disconnectedSince: null,
    });
  }
  return {
    seed,
    radius: map.radius,
    heart: START_HEX,
    heartMovedAt: null,
    nutrients: ECONOMY.startingNutrients,
    biomass: 0,
    upgrades: emptyUpgrades(),
    queue: [],
    lastSeenAt: null,
    tiles,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Network (GDD §2.4)

const isGrown = (t: Tile | undefined): boolean => t !== undefined && t.owned && t.growthEndsAt === null;

/**
 * Hops from the Cœur to every colonised tile it can reach through colonised tiles.
 * Tiles missing from the result are disconnected.
 */
export function networkHops(state: GameState): Map<string, number> {
  const hops = new Map<string, number>();
  const heart = state.tiles.get(hexKey(state.heart));
  if (!heart || !isGrown(heart)) return hops;
  hops.set(hexKey(heart), 0);
  let frontier: Hex[] = [heart];
  for (let d = 1; frontier.length; d++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of hexNeighbors(h)) {
        const k = hexKey(n);
        if (hops.has(k) || !isGrown(state.tiles.get(k))) continue;
        hops.set(k, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return hops;
}

/** Share of a tile's nutrients lost on the way to the Cœur (GDD §2.4: 1 % per hop). */
export function transportLoss(hops: number): number {
  return Math.min(TRANSPORT.maxLoss, TRANSPORT.lossPerHop * hops);
}

/** Humidity multiplier of a tile: bonus next to a wetland (GDD §2.2). */
export function humidity(state: GameState, h: Hex): number {
  const wet = hexNeighbors(h).some((n) => state.tiles.get(hexKey(n))?.terrain === "wetland");
  return wet ? 1 + HUMIDITY.wetlandBonus : 1;
}

/** Production multiplier while the player is away (GDD §9). */
export function offlineFactor(state: GameState, at: number): number {
  if (state.lastSeenAt === null) return 1;
  return at - state.lastSeenAt < OFFLINE.fullMs ? 1 : OFFLINE.reducedFactor;
}

// ---------------------------------------------------------------------------
// Derived values

/** Nutrients per second of one fresh colonised tile of this terrain, before humidity and transport. */
export function tileYield(terrain: Terrain, upgrades: Upgrades): number {
  const digestion = 1 + UPGRADE_STATS.digestion.perLevel * upgrades.digestion;
  const wood = terrain === "deadwood" ? 1 + UPGRADE_STATS.woodDecomposer.perLevel * upgrades.woodDecomposer : 1;
  return TERRAIN_STATS[terrain].yieldPerSecond * digestion * wood;
}

/**
 * Current nutrients per second delivered to the Cœur by one tile (GDD §10 `production_case`
 * after transport), 0 if it is not colonised or disconnected.
 */
export function tileProduction(state: GameState, tile: Tile, hops: Map<string, number> = networkHops(state)): number {
  const d = hops.get(hexKey(tile));
  if (!isGrown(tile) || d === undefined) return 0;
  return tileYield(tile.terrain, state.upgrades) * humidity(state, tile) * (1 - tile.exhaustion) * (1 - transportLoss(d));
}

/** Total nutrients per second right now (GDD §10 `production_totale`), including the offline factor. */
export function productionRate(state: GameState, at: number = state.updatedAt): number {
  const hops = networkHops(state);
  let total = 0;
  for (const t of state.tiles.values()) total += tileProduction(state, t, hops);
  return total * offlineFactor(state, at);
}

/** Share of the production credited as Biomass (GDD §10 `taux_conversion`). */
export function conversionRate(upgrades: Upgrades): number {
  return ECONOMY.biomassConversionRate * (1 + UPGRADE_STATS.biomassConversion.perLevel * upgrades.biomassConversion);
}

/** Tiles owned by the player, growing ones included (the `nb_cases` of the cost formula). */
export function ownedCount(state: GameState): number {
  let n = 0;
  for (const t of state.tiles.values()) if (t.owned) n++;
  return n;
}

export function growingTiles(state: GameState): Tile[] {
  return [...state.tiles.values()].filter((t) => t.owned && t.growthEndsAt !== null);
}

/** `base × (1 + 0.05 × dist_cœur) × 1.02^nb_cases`, reduced by Expansion économe (GDD §2.3). */
export function colonizationCost(state: GameState, target: Hex & { terrain: Terrain }): number {
  const dist = hexDistance(state.heart, target);
  const thrifty = Math.pow(1 - UPGRADE_STATS.thriftyExpansion.perLevel, state.upgrades.thriftyExpansion);
  return (
    TERRAIN_STATS[target.terrain].baseCost *
    (1 + ECONOMY.distanceFactor * dist) *
    Math.pow(ECONOMY.sizeFactor, ownedCount(state)) *
    thrifty
  );
}

/** Hyphae growth time in ms, reduced by Croissance des hyphes. */
export function growthDurationMs(terrain: Terrain, upgrades: Upgrades): number {
  const factor = Math.pow(1 - UPGRADE_STATS.hyphalGrowth.perLevel, upgrades.hyphalGrowth);
  return Math.round(TERRAIN_STATS[terrain].growthSeconds * 1000 * factor);
}

/**
 * Share of the hyphae growth done at `now`, from 0 to 1. It relies on the recorded start so that
 * buying Croissance des hyphes during a growth does not move the progress backwards.
 */
export function growthProgress(tile: Tile, now: number, upgrades: Upgrades): number {
  if (tile.growthEndsAt === null) return tile.owned ? 1 : 0;
  const total =
    tile.growthStartedAt !== null
      ? tile.growthEndsAt - tile.growthStartedAt
      : // Growths started before the start time was recorded: best estimate.
        Math.max(growthDurationMs(tile.terrain, upgrades), tile.growthEndsAt - now);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (tile.growthEndsAt - now) / total));
}

/** `base × 1.15^level` (GDD §10). */
export function upgradeCost(id: UpgradeId, level: number): number {
  return UPGRADE_STATS[id].baseCost * Math.pow(ECONOMY.upgradeCostGrowth, level);
}

/** Wild tile next to a colonised (fully grown) tile of the network (GDD §2.3). */
export function isAdjacentToNetwork(state: GameState, h: Hex): boolean {
  return hexNeighbors(h).some((n) => isGrown(state.tiles.get(hexKey(n))));
}

export function queueIndex(state: GameState, h: Hex): number {
  return state.queue.findIndex((q) => hexEquals(q, h));
}

/** When the Cœur can move again (ms since epoch); in the past if it can move now. */
export function heartReadyAt(state: GameState): number {
  return state.heartMovedAt === null ? -Infinity : state.heartMovedAt + HEART_MOVE_COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// Actions (they mutate `state`; call `advance(state, now)` first)

/**
 * Checks adding a tile to the expansion queue. A tile can be queued next to the network, next to a
 * growing tile, or next to a tile already in the queue, so a whole path can be planned.
 */
export function checkColonize(state: GameState, h: Hex): ActionResult {
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (!TERRAIN_STATS[tile.terrain].colonizable) return { ok: false, error: "impassable" };
  if (tile.owned) return { ok: false, error: "already_owned" };
  if (queueIndex(state, h) >= 0) return { ok: false, error: "already_queued" };
  if (state.queue.length >= QUEUE_MAX) return { ok: false, error: "queue_full" };
  const planned = new Set(state.queue.map(hexKey));
  const reachable = hexNeighbors(h).some((n) => state.tiles.get(hexKey(n))?.owned || planned.has(hexKey(n)));
  if (!reachable) return { ok: false, error: "not_adjacent" };
  return { ok: true };
}

/**
 * Adds a tile to the expansion queue and starts it right away when possible. Queued tiles start
 * one after the other, as soon as nothing is growing and the nutrients are there (GDD §9).
 */
export function colonize(state: GameState, h: Hex, now: number): ActionResult {
  const check = checkColonize(state, h);
  if (!check.ok) return check;
  state.queue.push({ q: h.q, r: h.r });
  startQueued(state, now);
  return check;
}

/** Removes a tile from the queue. Tiles planned behind it are dropped later if they become unreachable. */
export function unqueue(state: GameState, h: Hex): ActionResult {
  const i = queueIndex(state, h);
  if (i < 0) return { ok: false, error: "not_queued" };
  state.queue.splice(i, 1);
  return { ok: true };
}

export function checkMoveHeart(state: GameState, h: Hex, now: number): ActionResult {
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (!networkHops(state).has(hexKey(h))) return { ok: false, error: "not_connected" };
  if (hexEquals(h, state.heart)) return { ok: false, error: "already_owned" };
  if (now < heartReadyAt(state)) return { ok: false, error: "heart_cooldown" };
  return { ok: true };
}

/** Moves the Cœur to another connected tile, once per day (GDD §2.4). */
export function moveHeart(state: GameState, h: Hex, now: number): ActionResult {
  const check = checkMoveHeart(state, h, now);
  if (!check.ok) return check;
  state.heart = { q: h.q, r: h.r };
  state.heartMovedAt = now;
  refreshConnections(state, now);
  return check;
}

export function checkBuyUpgrade(state: GameState, id: string): ActionResult {
  if (!isUpgradeId(id)) return { ok: false, error: "unknown_upgrade" };
  if (state.nutrients < upgradeCost(id, state.upgrades[id])) return { ok: false, error: "not_enough_nutrients" };
  return { ok: true };
}

export function buyUpgrade(state: GameState, id: string): ActionResult {
  const check = checkBuyUpgrade(state, id);
  if (!check.ok || !isUpgradeId(id)) return check;
  state.nutrients -= upgradeCost(id, state.upgrades[id]);
  state.upgrades[id] += 1;
  return check;
}

/** Player leaves (last client gone): production follows the offline rules from now on. */
export function goOffline(state: GameState, now: number): void {
  advance(state, now);
  state.lastSeenAt ??= now;
}

/** Player is back: full production again. */
export function goOnline(state: GameState, now: number): void {
  advance(state, now);
  state.lastSeenAt = null;
}

// ---------------------------------------------------------------------------
// Time

/**
 * Simulates the game from `state.updatedAt` to `to`. Production is integrated exactly between
 * events (growth ends, Dead wood turning into Humus, withering, the offline threshold); the
 * queue retries on a fixed 5 s grid while it waits for nutrients. Event times depend only on the
 * state, never on how often `advance` is called, so one call over a week and thousands of 5 s
 * ticks give the same game (up to float rounding).
 */
export function advance(state: GameState, to: number): void {
  let t = state.updatedAt;
  if (to <= t) return;
  refreshConnections(state, t);
  let plan = planWindow(state, t);

  for (;;) {
    const waiting = plan.queueWaiting ? (Math.floor(t / TICK_MS) + 1) * TICK_MS : Infinity;
    const event = Math.min(plan.nextEvent, waiting);
    const next = Math.min(to, event);
    integrate(state, plan, next - t);
    t = next;
    if (next < event) break; // Reached `to` before the next event.

    let changed = false;
    if (plan.nextEvent <= t) {
      for (const tile of state.tiles.values()) {
        if (tile.growthEndsAt !== null && tile.growthEndsAt <= t) {
          tile.growthEndsAt = null;
          tile.growthStartedAt = null;
          changed = true;
        }
        if (tile.terrain === "deadwood" && tile.owned && tile.exhaustion >= EXHAUSTION.max - 1e-9) {
          // GDD §2.2: exhausted Dead wood becomes (fresh) Humus.
          tile.terrain = "humus";
          tile.exhaustion = 0;
          changed = true;
        }
        if (tile.owned && tile.disconnectedSince !== null && t - tile.disconnectedSince >= TRANSPORT.witherMs) {
          tile.owned = false;
          tile.growthEndsAt = null;
          tile.growthStartedAt = null;
          tile.disconnectedSince = null;
          changed = true;
        }
      }
      changed = true; // The offline threshold also changes the window.
    }
    if (changed) refreshConnections(state, t);
    if (startQueued(state, t)) changed = true;
    if (changed) plan = planWindow(state, t);
    if (t >= to) break;
  }
  state.updatedAt = to;
}

interface Producer {
  tile: Tile;
  /** Nutrients per ms of the tile when fresh, after humidity and transport. */
  basePerMs: number;
  lifetime: number;
}

/** What stays constant until the next event: who produces, who rests, when the next event is. */
interface Window {
  producers: Producer[];
  resting: Tile[];
  factor: number;
  nextEvent: number;
  queueWaiting: boolean;
}

function planWindow(state: GameState, t: number): Window {
  const hops = networkHops(state);
  const producers: Producer[] = [];
  const resting: Tile[] = [];
  let next = Infinity;
  let growing = false;
  for (const tile of state.tiles.values()) {
    const lifetime = TERRAIN_STATS[tile.terrain].lifetimeMs;
    const d = hops.get(hexKey(tile));
    if (isGrown(tile) && d !== undefined) {
      const perSecond = tileYield(tile.terrain, state.upgrades) * humidity(state, tile) * (1 - transportLoss(d));
      producers.push({ tile, basePerMs: perSecond / 1000, lifetime });
      // Rounded up to a whole ms so every event time stays an integer (it is stored as a timestamp).
      if (tile.terrain === "deadwood") next = Math.min(next, t + Math.ceil(Math.max(0, EXHAUSTION.max - tile.exhaustion) * lifetime));
    } else if (tile.exhaustion > 0 && lifetime > 0) {
      resting.push(tile);
    }
    if (tile.growthEndsAt !== null) {
      growing = true;
      next = Math.min(next, tile.growthEndsAt);
    }
    if (tile.owned && tile.disconnectedSince !== null) next = Math.min(next, tile.disconnectedSince + TRANSPORT.witherMs);
  }
  if (state.lastSeenAt !== null && state.lastSeenAt + OFFLINE.fullMs > t) {
    next = Math.min(next, state.lastSeenAt + OFFLINE.fullMs);
  }
  return {
    producers,
    resting,
    factor: offlineFactor(state, t),
    nextEvent: Math.max(next, t),
    queueWaiting: state.queue.length > 0 && !growing,
  };
}

/** Accrues production and updates exhaustion over `dt` ms inside one window. */
function integrate(state: GameState, w: Window, dt: number): void {
  if (dt <= 0) return;
  let produced = 0;
  for (const p of w.producers) {
    // ∫ (1 − e(τ)) dτ with e rising at 1/lifetime per ms, capped at EXHAUSTION.max.
    const e0 = p.tile.exhaustion;
    const rising = Math.min(dt, Math.max(0, (EXHAUSTION.max - e0) * p.lifetime));
    const freshMs = rising * (1 - e0) - (rising * rising) / (2 * p.lifetime) + (dt - rising) * (1 - EXHAUSTION.max);
    produced += p.basePerMs * freshMs;
    p.tile.exhaustion = Math.min(EXHAUSTION.max, e0 + dt / p.lifetime);
  }
  for (const tile of w.resting) {
    // Resting tiles recover (GDD §2.3: "se régénère lentement").
    const lifetime = TERRAIN_STATS[tile.terrain].lifetimeMs;
    tile.exhaustion = Math.max(0, tile.exhaustion - dt / (lifetime * EXHAUSTION.regenSlowdown));
  }
  produced *= w.factor;
  state.nutrients += produced;
  state.biomass += produced * conversionRate(state.upgrades);
}

/** Marks owned tiles as connected or disconnected (disconnected ones start withering). */
function refreshConnections(state: GameState, now: number): void {
  const hops = networkHops(state);
  for (const tile of state.tiles.values()) {
    if (!isGrown(tile)) {
      tile.disconnectedSince = null;
      continue;
    }
    if (hops.has(hexKey(tile))) tile.disconnectedSince = null;
    else tile.disconnectedSince ??= now;
  }
}

/** Starts queued colonisations while possible. Returns true if one started. */
function startQueued(state: GameState, now: number): boolean {
  let started = false;
  while (state.queue.length > 0 && growingTiles(state).length < ECONOMY.maxConcurrentGrowths) {
    const head = state.queue[0]!;
    const tile = state.tiles.get(hexKey(head));
    if (!tile || tile.owned || !TERRAIN_STATS[tile.terrain].colonizable || !isAdjacentToNetwork(state, tile)) {
      state.queue.shift(); // No longer possible: drop it.
      continue;
    }
    const cost = colonizationCost(state, tile);
    if (state.nutrients < cost) break;
    state.nutrients -= cost;
    tile.owned = true;
    tile.growthStartedAt = now;
    tile.growthEndsAt = now + growthDurationMs(tile.terrain, state.upgrades);
    tile.disconnectedSince = null;
    state.queue.shift();
    started = true;
  }
  return started;
}

/** Deep copy, handy for client-side prediction, saves and tests. */
export function cloneGame(state: GameState): GameState {
  const tiles = new Map<string, Tile>();
  for (const [k, t] of state.tiles) tiles.set(k, { ...t });
  return {
    ...state,
    heart: { ...state.heart },
    upgrades: { ...state.upgrades },
    queue: state.queue.map((h) => ({ ...h })),
    tiles,
  };
}
