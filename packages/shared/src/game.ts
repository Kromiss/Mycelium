import { ECONOMY, TERRAIN_STATS, UPGRADE_IDS, UPGRADE_STATS, type Terrain, type UpgradeId } from "./balance";
import { hexDistance, hexKey, hexNeighbors, type Hex } from "./hex";
import { generateMap, START_HEX } from "./mapgen";

/**
 * Solo game rules (GDD §2.3, §3, §10). The functions here are the single source of truth:
 * the server runs them with authority, the client runs them to display predictions.
 */

export interface Tile extends Hex {
  readonly terrain: Terrain;
  /** Colonised by the player (possibly still growing). */
  owned: boolean;
  /** When owned: end of the hyphae growth (ms since epoch), or null once the tile is colonised. */
  growthEndsAt: number | null;
}

export type Upgrades = Record<UpgradeId, number>;

export interface GameState {
  readonly seed: number;
  readonly radius: number;
  /** Start tile; becomes the Cœur in M2 (GDD §2.4). */
  readonly heart: Hex;
  nutrients: number;
  /** Cumulated biomass: the leaderboard score (GDD §3, §5). */
  biomass: number;
  upgrades: Upgrades;
  /** Every tile of the map, keyed by `hexKey`. */
  readonly tiles: Map<string, Tile>;
  /** Time up to which resources have been accrued (ms since epoch). */
  updatedAt: number;
}

export type ActionError =
  | "unknown_tile"
  | "already_owned"
  | "not_adjacent"
  | "growth_limit"
  | "not_enough_nutrients"
  | "unknown_upgrade";

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

/** A fresh solo game: the start tile is colonised, everything else is wild. */
export function newGame(seed: number, now: number, radius?: number): GameState {
  const map = generateMap(seed, radius);
  const tiles = new Map<string, Tile>();
  for (const t of map.tiles) {
    const isStart = t.q === START_HEX.q && t.r === START_HEX.r;
    tiles.set(hexKey(t), { q: t.q, r: t.r, terrain: t.terrain, owned: isStart, growthEndsAt: null });
  }
  return {
    seed,
    radius: map.radius,
    heart: START_HEX,
    nutrients: ECONOMY.startingNutrients,
    biomass: 0,
    upgrades: emptyUpgrades(),
    tiles,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Derived values

/** Nutrients per second of one colonised tile of this terrain (GDD §10 `production_case`). */
export function tileYield(terrain: Terrain, upgrades: Upgrades): number {
  const digestion = 1 + UPGRADE_STATS.digestion.perLevel * upgrades.digestion;
  const wood = terrain === "deadwood" ? 1 + UPGRADE_STATS.woodDecomposer.perLevel * upgrades.woodDecomposer : 1;
  // Humidity and exhaustion arrive in M2; they are 1 and 0 here.
  return TERRAIN_STATS[terrain].yieldPerSecond * digestion * wood;
}

/** Total nutrients per second (GDD §10 `production_totale`, without transport loss until M2). */
export function productionRate(state: GameState): number {
  let total = 0;
  for (const t of state.tiles.values()) {
    if (t.owned && t.growthEndsAt === null) total += tileYield(t.terrain, state.upgrades);
  }
  return total;
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
export function colonizationCost(state: GameState, target: Tile): number {
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

/** `base × 1.15^level` (GDD §10). */
export function upgradeCost(id: UpgradeId, level: number): number {
  return UPGRADE_STATS[id].baseCost * Math.pow(ECONOMY.upgradeCostGrowth, level);
}

/** Wild tile next to a colonised (fully grown) tile of the network (GDD §2.3). */
export function isAdjacentToNetwork(state: GameState, h: Hex): boolean {
  return hexNeighbors(h).some((n) => {
    const t = state.tiles.get(hexKey(n));
    return t !== undefined && t.owned && t.growthEndsAt === null;
  });
}

/** Checks a colonisation without applying it. */
export function checkColonize(state: GameState, h: Hex): ActionResult {
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (tile.owned) return { ok: false, error: "already_owned" };
  if (!isAdjacentToNetwork(state, tile)) return { ok: false, error: "not_adjacent" };
  if (growingTiles(state).length >= ECONOMY.maxConcurrentGrowths) return { ok: false, error: "growth_limit" };
  if (state.nutrients < colonizationCost(state, tile)) return { ok: false, error: "not_enough_nutrients" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// State transitions (they mutate `state`; call `advance(state, now)` first)

/** Pays and starts the hyphae growth on a wild adjacent tile. */
export function colonize(state: GameState, h: Hex, now: number): ActionResult {
  const check = checkColonize(state, h);
  if (!check.ok) return check;
  const tile = state.tiles.get(hexKey(h))!;
  state.nutrients -= colonizationCost(state, tile);
  tile.owned = true;
  tile.growthEndsAt = now + growthDurationMs(tile.terrain, state.upgrades);
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

export function isUpgradeId(id: string): id is UpgradeId {
  return (UPGRADE_IDS as readonly string[]).includes(id);
}

/**
 * Accrues production from `state.updatedAt` to `to`, completing the growths that end on the
 * way: production changes exactly when a tile finishes growing, so the result does not
 * depend on how often it is called (one 5 s tick or one call over an hour give the same state).
 */
export function advance(state: GameState, to: number): void {
  let t = state.updatedAt;
  if (to <= t) return;
  for (;;) {
    let next = Infinity;
    for (const tile of state.tiles.values()) {
      if (tile.growthEndsAt !== null && tile.growthEndsAt < next) next = tile.growthEndsAt;
    }
    const until = Math.min(Math.max(next, t), to);
    accrue(state, (until - t) / 1000);
    t = until;
    if (next > to) break;
    for (const tile of state.tiles.values()) {
      if (tile.growthEndsAt !== null && tile.growthEndsAt <= t) tile.growthEndsAt = null;
    }
  }
  state.updatedAt = to;
}

function accrue(state: GameState, seconds: number): void {
  if (seconds <= 0) return;
  const produced = productionRate(state) * seconds;
  state.nutrients += produced;
  state.biomass += produced * conversionRate(state.upgrades);
}

/** Deep copy, handy for client-side prediction and tests. */
export function cloneGame(state: GameState): GameState {
  const tiles = new Map<string, Tile>();
  for (const [k, t] of state.tiles) tiles.set(k, { ...t });
  return { ...state, upgrades: { ...state.upgrades }, tiles };
}
