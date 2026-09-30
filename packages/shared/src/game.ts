import {
  ECONOMY,
  ENZYMES_UNLOCK_TILES,
  EXHAUSTION,
  HEART_MOVE_COOLDOWN_MS,
  ACID,
  HUMIDITY,
  MUTATION_BRANCHES,
  MUTATION_IDS,
  MUTATIONS,
  OFFLINE,
  QUEUE_MAX,
  ROOTS,
  STRUCTURE_IDS,
  STRAIN_IDS,
  STRAINS,
  STRUCTURES,
  TERRAIN_STATS,
  TICK_MS,
  TRANSPORT,
  UPGRADE_IDS,
  UPGRADE_STATS,
  type MutationId,
  type StrainId,
  type StructureId,
  type Terrain,
  type UpgradeId,
} from "./balance";
import { lifetimeFactorAt, richnessAt, type MapLayout } from "./forestgen";
import { hexDistance, hexEquals, hexKey, hexNeighbors, type Hex } from "./hex";
import { generateMap, START_HEX } from "./mapgen";
import { NEUTRAL_EFFECTS, nextPhaseChange, phaseAt, type PhaseEffects } from "./season";

/**
 * Economy rules of one player (GDD §2.3, §2.4, §3, §9, §10). A player's `GameState` shares its
 * `tiles` with every other player of the forest; a tile belongs to whoever `owner` names. The
 * functions here are the single source of truth: the server runs them with authority, the client
 * runs them on what it can see to display predictions.
 */

export interface Tile extends Hex {
  /** Mutable: exhausted Dead wood turns into Humus. */
  terrain: Terrain;
  /** Player who colonised the tile (possibly still growing), null for a wild tile. */
  owner: string | null;
  /** When owned: end of the hyphae growth (ms since epoch), or null once the tile is colonised. */
  growthEndsAt: number | null;
  /** When growing: start of the hyphae growth (ms since epoch); null otherwise or if unknown. */
  growthStartedAt: number | null;
  /** Wear, from 0 (fresh) to EXHAUSTION.max. Grows while the tile produces, never recovers. */
  exhaustion: number;
  /** When an owned tile lost its link to its owner's Cœur (ms since epoch), null while connected. */
  disconnectedSince: number | null;
  /** A neighbour taking the tile over by pressure (GDD §6.1): who, and how far (0 to 1). */
  capture: { by: string; progress: number } | null;
  /**
   * Start zone this tile belongs to (GDD §6.4): only that player may colonise it. A player id for a
   * new player's zone, `slice:<n>` for a slice nobody has joined yet, null elsewhere. Derived by
   * the forest (see `refreshReservations`), not stored.
   */
  reservedFor: string | null;
  /** Structure built on the tile (GDD §4.1), one at most; it goes with the tile's owner. */
  structure: StructureId | null;
  /**
   * Touches a tile of another player who has the Toxines mutation (GDD §4.2): produces less. Derived
   * by the forest (see `refreshToxins`), not stored.
   */
  toxic: boolean;
}

export type Upgrades = Record<UpgradeId, number>;

export interface GameState {
  /** Player id: tiles with this `owner` are this player's. */
  readonly id: string;
  readonly seed: number;
  readonly radius: number;
  readonly layout: MapLayout;
  /** Where the player started; its surroundings are protected for a while (GDD §6.4). */
  readonly spawn: Hex;
  readonly joinedAt: number;
  /** Tiles taken from other players (GDD §2.5 "Trophée"). */
  trophies: number;
  /** Follows the weekly calendar and its daily phases (GDD §7). False for solo games and tests. */
  readonly calendar: boolean;
  /** Production bonus on Monday from the previous season's rank (GDD §8.2), e.g. 0.05. */
  mondayBonus: number;
  /** Strain chosen for the season (GDD §4.3), null until chosen. */
  strain: StrainId | null;
  /** Mutations taken this season (GDD §4.2), in the order they were taken. */
  mutations: MutationId[];
  /** The Cœur: nutrients flow to it (GDD §2.4). */
  heart: Hex;
  /** Last time the Cœur was moved, null if never. */
  heartMovedAt: number | null;
  nutrients: number;
  /** GDD §3: made by Glandes enzymatiques, spent on Rock (and on active actions in M6). */
  enzymes: number;
  /** Enzymes appear once, and stay: from the 15th tile or from Tuesday (GDD §3 "déblocage progressif"). */
  enzymesUnlocked: boolean;
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
  | "occupied"
  | "reserved"
  | "already_queued"
  | "queue_full"
  | "not_queued"
  | "not_adjacent"
  | "not_enough_nutrients"
  | "unknown_upgrade"
  | "not_connected"
  | "heart_cooldown"
  | "locked"
  | "not_enough_enzymes"
  | "unknown_structure"
  | "has_structure"
  | "no_structure"
  | "structure_limit"
  | "unknown_mutation"
  | "already_mutated"
  | "mutation_locked"
  | "no_mutation_point"
  | "unknown_strain"
  | "strain_chosen";

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

export const SOLO_PLAYER = "solo";

/** A wild tile, fresh. */
export function wildTile(h: Hex, terrain: Terrain): Tile {
  return {
    q: h.q,
    r: h.r,
    terrain,
    owner: null,
    growthEndsAt: null,
    growthStartedAt: null,
    exhaustion: 0,
    disconnectedSince: null,
    capture: null,
    reservedFor: null,
    structure: null,
    toxic: false,
  };
}

/** A new player's state on shared `tiles`: their spawn is colonised and becomes their Cœur. */
export function newPlayer(
  id: string,
  map: { seed: number; radius: number; layout: MapLayout; tiles: Map<string, Tile>; calendar?: boolean },
  spawn: Hex,
  now: number,
): GameState {
  const start = map.tiles.get(hexKey(spawn));
  if (start) {
    start.owner = id;
    start.growthEndsAt = null;
    start.growthStartedAt = null;
    start.disconnectedSince = null;
    start.capture = null;
    start.structure = null;
  }
  return {
    id,
    seed: map.seed,
    radius: map.radius,
    layout: map.layout,
    spawn: { q: spawn.q, r: spawn.r },
    joinedAt: now,
    trophies: 0,
    calendar: map.calendar ?? false,
    mondayBonus: 0,
    strain: null,
    mutations: [],
    heart: { q: spawn.q, r: spawn.r },
    heartMovedAt: null,
    nutrients: ECONOMY.startingNutrients,
    enzymes: 0,
    enzymesUnlocked: false,
    biomass: 0,
    upgrades: emptyUpgrades(),
    queue: [],
    lastSeenAt: null,
    tiles: map.tiles,
    updatedAt: now,
  };
}

/** A solo game (M1/M2 maps, tests and simulations): one player alone on a generated map. */
export function newGame(seed: number, now: number, radius?: number): GameState {
  const map = generateMap(seed, radius);
  const tiles = new Map<string, Tile>();
  for (const t of map.tiles) tiles.set(hexKey(t), wildTile(t, t.terrain));
  return newPlayer(SOLO_PLAYER, { seed, radius: map.radius, layout: { kind: "solo" }, tiles }, START_HEX, now);
}

// ---------------------------------------------------------------------------
// Network (GDD §2.4)

/** The tile belongs to this player (growing or not). */
export const isMine = (state: GameState, t: Tile | undefined): t is Tile => t !== undefined && t.owner === state.id;
const isGrown = (state: GameState, t: Tile | undefined): boolean => isMine(state, t) && t.growthEndsAt === null;

/**
 * Hops from the Cœur to every colonised tile it can reach through colonised tiles. Stepping onto a
 * Rhizomorphe costs no hop (GDD §4.1: a reinforced cord). Tiles missing from the result are disconnected.
 */
export function networkHops(state: GameState): Map<string, number> {
  const hops = new Map<string, number>();
  const heart = state.tiles.get(hexKey(state.heart));
  if (!heart || !isGrown(state, heart)) return hops;
  hops.set(hexKey(heart), 0);
  // 0-1 breadth-first search: free steps go to the front of the deque.
  const deque: Array<[Hex, number]> = [[heart, 0]];
  let head = 0;
  const front: Array<[Hex, number]> = [];
  while (front.length > 0 || head < deque.length) {
    const [h, d] = front.length > 0 ? front.pop()! : deque[head++]!;
    if (d > hops.get(hexKey(h))!) continue;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      const t = state.tiles.get(k);
      if (!t || !isGrown(state, t)) continue;
      const free = t.structure === "rhizomorph";
      const nd = free ? d : d + 1;
      const known = hops.get(k);
      if (known !== undefined && known <= nd) continue;
      hops.set(k, nd);
      if (free) front.push([n, nd]);
      else deque.push([n, nd]);
    }
  }
  return hops;
}

/** Share of a tile's nutrients lost on the way to the Cœur (GDD §2.4: 1 % per hop), × `factor` (Cordons mycéliens). */
export function transportLoss(hops: number, factor = 1): number {
  return Math.min(TRANSPORT.maxLoss, TRANSPORT.lossPerHop * hops * factor);
}

/** Humidity multiplier of a tile: bonus next to a wetland or to one of the player's Réservoirs (GDD §2.2, §4.1). */
export function humidity(state: GameState, h: Hex): number {
  const wet = hexNeighbors(h).some((n) => {
    const t = state.tiles.get(hexKey(n));
    return t !== undefined && (t.terrain === "wetland" || (t.structure === "reservoir" && isGrown(state, t)));
  });
  return wet ? 1 + HUMIDITY.wetlandBonus : 1;
}

/** Production multiplier while the player is away (GDD §9); Dormance trades online for offline production. */
export function offlineFactor(state: GameState, at: number): number {
  const dormant = hasMutation(state, "dormancy");
  if (state.lastSeenAt === null) return dormant ? MUTATIONS.dormancyOnline : 1;
  const base = at - state.lastSeenAt < OFFLINE.fullMs ? 1 : OFFLINE.reducedFactor;
  return dormant ? base * MUTATIONS.dormancyOffline : base;
}

// ---------------------------------------------------------------------------
// Mutations and strains (GDD §4.2, §4.3)

export function hasMutation(state: GameState, id: MutationId): boolean {
  return state.mutations.includes(id);
}

export function isMutationId(id: string): id is MutationId {
  return (MUTATION_IDS as readonly string[]).includes(id);
}

export function isStrainId(id: string): id is StrainId {
  return (STRAIN_IDS as readonly string[]).includes(id);
}

/** Biomass at which the n-th mutation point (n ≥ 1) is earned: 20 k, 60 k, 180 k… */
export function mutationThreshold(n: number): number {
  return MUTATIONS.firstThreshold * Math.pow(MUTATIONS.thresholdGrowth, n - 1);
}

/** Mutation points earned by the season's biomass. */
export function earnedMutationPoints(biomass: number): number {
  let n = 0;
  while (biomass >= mutationThreshold(n + 1)) n++;
  return n;
}

/** Points left to spend. */
export function mutationPoints(state: GameState): number {
  return earnedMutationPoints(state.biomass) - state.mutations.length;
}

/** The branch of a mutation, and the mutation it requires (null for the first of a branch). */
export function mutationPlace(id: MutationId): { branch: keyof typeof MUTATION_BRANCHES; requires: MutationId | null } {
  for (const [branch, list] of Object.entries(MUTATION_BRANCHES) as Array<[keyof typeof MUTATION_BRANCHES, readonly MutationId[]]>) {
    const i = list.indexOf(id);
    if (i >= 0) return { branch, requires: i === 0 ? null : list[i - 1]! };
  }
  throw new Error(`Unknown mutation ${id}`);
}

export function checkMutate(state: GameState, id: string): ActionResult {
  if (!isMutationId(id)) return { ok: false, error: "unknown_mutation" };
  if (hasMutation(state, id)) return { ok: false, error: "already_mutated" };
  const { requires } = mutationPlace(id);
  if (requires !== null && !hasMutation(state, requires)) return { ok: false, error: "mutation_locked" };
  if (mutationPoints(state) < 1) return { ok: false, error: "no_mutation_point" };
  return { ok: true };
}

/** Takes a mutation for the rest of the season (no respec). */
export function mutate(state: GameState, id: string, now: number): ActionResult {
  const check = checkMutate(state, id);
  if (!check.ok || !isMutationId(id)) return check;
  state.mutations.push(id);
  refreshConnections(state, now);
  return check;
}

export function checkChooseStrain(state: GameState, id: string): ActionResult {
  if (!isStrainId(id)) return { ok: false, error: "unknown_strain" };
  if (state.strain !== null || ownedCount(state) > 1) return { ok: false, error: "strain_chosen" };
  return { ok: true };
}

/** Picks the season's strain, before the first colonised tile; final for the season. */
export function chooseStrain(state: GameState, id: string): ActionResult {
  const check = checkChooseStrain(state, id);
  if (!check.ok || !isStrainId(id)) return check;
  state.strain = id;
  return check;
}

/** Whether the player may colonise this terrain at all (wetlands need Hyphes aquatiques). */
export function canColonizeTerrain(state: GameState, terrain: Terrain): boolean {
  if (terrain === "wetland") return hasMutation(state, "aquaticHyphae");
  return TERRAIN_STATS[terrain].colonizable;
}

/** Wear stops counting at this level for the player (Usure lente). */
export function wearCap(state: GameState): number {
  return hasMutation(state, "slowWear") ? MUTATIONS.slowWearCap : EXHAUSTION.max;
}

/** Multiplier on the player's Roots (Mycorhize, Truffe). */
export function rootsFactor(state: GameState): number {
  return (hasMutation(state, "mycorrhiza") ? MUTATIONS.mycorrhiza : 1) * (state.strain === "truffle" ? STRAINS.truffle.roots : 1);
}

/** Yield multiplier of a terrain for the player (Saprophyte, Roots). */
export function terrainFactor(state: GameState, terrain: Terrain): number {
  if ((terrain === "deadwood" || terrain === "stump") && hasMutation(state, "saprophyte")) return 1 + MUTATIONS.saprophyte;
  if (terrain === "roots") return rootsFactor(state);
  return 1;
}

/** Hyphae growth time multiplier of the strain (Pleurote). */
export function strainGrowthFactor(state: GameState): number {
  return state.strain === "pleurotus" ? STRAINS.pleurotus.growthTime : 1;
}

/** Border pressure multiplier (Hyphes agressives, Cordyceps). */
export function pressureFactor(state: GameState): number {
  return (hasMutation(state, "aggressiveHyphae") ? 1 + MUTATIONS.aggressiveHyphae : 1) * (state.strain === "cordyceps" ? STRAINS.cordyceps.pressure : 1);
}

/** Speed at which the player's tiles are taken (Résilience, Pleurote). */
export function capturedFactor(state: GameState): number {
  return (hasMutation(state, "resilience") ? MUTATIONS.resilience : 1) * (state.strain === "pleurotus" ? STRAINS.pleurotus.capturedSpeed : 1);
}

/** Conquest bonus multiplier (Pillage, Cordyceps). */
export function conquestFactor(state: GameState): number {
  return (hasMutation(state, "plunder") ? MUTATIONS.plunder : 1) * (state.strain === "cordyceps" ? STRAINS.cordyceps.conquestBonus : 1);
}

/** Production multiplier from mutations and strain that does not depend on the map (Enzymes digestives, Cordyceps, Armillaire). */
export function traitProduction(state: GameState, at: number): number {
  let m = hasMutation(state, "digestiveEnzymes") ? 1 + MUTATIONS.digestiveEnzymes : 1;
  if (state.strain === "cordyceps") m *= STRAINS.cordyceps.production;
  if (state.strain === "armillaria" && state.calendar) m *= STRAINS.armillaria.monday + STRAINS.armillaria.perDay * phaseAt(at).index;
  return m;
}

/** Témérité: +3 % per tile of the player touching another player's tile, up to +30 %. */
export function temerityFactor(state: GameState): number {
  if (!hasMutation(state, "temerity")) return 1;
  let border = 0;
  for (const t of state.tiles.values()) {
    if (t.owner !== state.id || t.growthEndsAt !== null) continue;
    if (hexNeighbors(t).some((n) => {
      const o = state.tiles.get(hexKey(n))?.owner;
      return o !== undefined && o !== null && o !== state.id;
    })) border++;
  }
  return 1 + Math.min(MUTATIONS.temerityMax, MUTATIONS.temerityPerTile * border);
}

// ---------------------------------------------------------------------------
// Derived values

/** Yield multiplier of a tile's place on the map (GDD §2.5: richer towards the forest centre). */
export function richness(state: GameState, h: Hex): number {
  return richnessAt(state.layout, state.radius, h);
}

/** Occupied time after which the tile's wear reaches its cap, in ms (longer on the forest rim; Acidophile). */
export function lifetimeMs(state: GameState, tile: Tile): number {
  const acid = tile.terrain === "acid" && hasMutation(state, "acidophile") ? ACID.acidophileLifetimeFactor : 1;
  return TERRAIN_STATS[tile.terrain].lifetimeMs * lifetimeFactorAt(state.layout, state.radius, tile) * acid;
}

/** Modifiers in force at `at`: the day's phase (GDD §7), or none outside the calendar. */
export function effectsAt(state: GameState, at: number): PhaseEffects {
  return state.calendar ? phaseAt(at).effects : NEUTRAL_EFFECTS;
}

/** Production multiplier of a tile under the given effects, including the Monday bonus. */
function phaseProduction(state: GameState, tile: Tile, fx: PhaseEffects, at: number): number {
  let m = fx.wetProduction !== null && humidity(state, tile) > 1 ? fx.wetProduction : fx.production;
  if (tile.terrain === "deadwood") m *= fx.deadwood;
  if (state.mondayBonus > 0 && state.calendar && phaseAt(at).id === "germination") m *= 1 + state.mondayBonus;
  return m;
}

/** Nutrients per second of one fresh colonised tile of this terrain, before place, humidity and transport. */
export function tileYield(terrain: Terrain, upgrades: Upgrades): number {
  const digestion = 1 + UPGRADE_STATS.digestion.perLevel * upgrades.digestion;
  const wood = terrain === "deadwood" ? 1 + UPGRADE_STATS.woodDecomposer.perLevel * upgrades.woodDecomposer : 1;
  return TERRAIN_STATS[terrain].yieldPerSecond * digestion * wood;
}

/** Production multiplier of a structure on its own tile (GDD §4.1). */
export function structureFactor(structure: StructureId | null): number {
  if (structure === "node") return 1 + STRUCTURES.nodeBonus;
  if (structure === "gland") return 1 - STRUCTURES.glandPenalty;
  return 1;
}

/**
 * Whole-network multiplier: each connected Roots tile adds its mycorrhiza bonus (GDD §2.2), times the
 * player's traits (mutations and strain) and Témérité.
 */
export function networkBonus(state: GameState, hops: Map<string, number> = networkHops(state), at: number = state.updatedAt): number {
  let roots = 0;
  for (const k of hops.keys()) if (state.tiles.get(k)!.terrain === "roots") roots++;
  return (1 + ROOTS.networkBonus * roots * rootsFactor(state)) * traitProduction(state, at) * temerityFactor(state);
}

/**
 * Current nutrients per second delivered to the Cœur by one tile (GDD §10 `production_case`
 * after transport), 0 if it is not colonised or disconnected.
 */
export function tileProduction(
  state: GameState,
  tile: Tile,
  hops: Map<string, number> = networkHops(state),
  at: number = state.updatedAt,
  bonus: number = networkBonus(state, hops, at),
): number {
  const d = hops.get(hexKey(tile));
  if (!isGrown(state, tile) || d === undefined) return 0;
  return baseProduction(state, tile, d, at) * bonus * (1 - Math.min(tile.exhaustion, wearCap(state)));
}

/** Nutrients per second of a fresh tile at `hops` from the Cœur: yield × structure × place × humidity × transport × phase. */
function baseProduction(state: GameState, tile: Tile, hops: number, at: number): number {
  return (
    tileYield(tile.terrain, state.upgrades) *
    terrainFactor(state, tile.terrain) *
    structureFactor(tile.structure) *
    richness(state, tile) *
    humidity(state, tile) *
    (1 - transportLoss(hops, hasMutation(state, "mycelialCords") ? MUTATIONS.mycelialCords : 1)) *
    phaseProduction(state, tile, effectsAt(state, at), at) *
    (tile.toxic ? 1 - MUTATIONS.toxins : 1)
  );
}

/** Total nutrients per second right now (GDD §10 `production_totale`), including the offline factor. */
export function productionRate(state: GameState, at: number = state.updatedAt): number {
  const hops = networkHops(state);
  const bonus = networkBonus(state, hops, at);
  let total = 0;
  for (const k of hops.keys()) total += tileProduction(state, state.tiles.get(k)!, hops, at, bonus);
  return total * offlineFactor(state, at);
}

/** Enzymes made by one connected Glande enzymatique (GDD §3: Glandes, and more on dead wood). */
export function glandRate(tile: Tile): number {
  const wood = tile.terrain === "deadwood" || tile.terrain === "stump" ? STRUCTURES.glandWoodFactor : 1;
  return STRUCTURES.glandEnzymesPerSecond * wood;
}

/** Enzymes per second right now, including the offline factor. */
export function enzymeRate(state: GameState, at: number = state.updatedAt): number {
  const hops = networkHops(state);
  let total = 0;
  for (const k of hops.keys()) {
    const t = state.tiles.get(k)!;
    if (t.structure === "gland") total += glandRate(t);
  }
  return total * offlineFactor(state, at);
}

/** Biomass gained per second right now (the score), phase included (0 once the season is frozen). */
export function biomassRate(state: GameState, at: number = state.updatedAt): number {
  return productionRate(state, at) * conversionRate(state.upgrades) * effectsAt(state, at).biomass;
}

/** Share of the production credited as Biomass (GDD §10 `taux_conversion`). */
export function conversionRate(upgrades: Upgrades): number {
  return ECONOMY.biomassConversionRate * (1 + UPGRADE_STATS.biomassConversion.perLevel * upgrades.biomassConversion);
}

/** Tiles owned by the player, growing ones included (the `nb_cases` of the cost formula). */
export function ownedCount(state: GameState): number {
  let n = 0;
  for (const t of state.tiles.values()) if (t.owner === state.id) n++;
  return n;
}

export function growingTiles(state: GameState): Tile[] {
  return [...state.tiles.values()].filter((t) => t.owner === state.id && t.growthEndsAt !== null);
}

/**
 * `base × (1 + 0.05 × dist_cœur) × 1.13^nb_cases`, reduced by Expansion économe (GDD §2.3). Rock is paid
 * in Enzymes (see `paidInEnzymes`), without the size factor: `base × (1 + 0.05 × dist_cœur)`.
 */
export function colonizationCost(state: GameState, target: Hex & { terrain: Terrain }, at: number = state.updatedAt): number {
  const dist = hexDistance(state.heart, target);
  if (TERRAIN_STATS[target.terrain].paidInEnzymes) return TERRAIN_STATS[target.terrain].baseCost * (1 + ECONOMY.distanceFactor * dist);
  const thrifty = Math.pow(1 - UPGRADE_STATS.thriftyExpansion.perLevel, state.upgrades.thriftyExpansion);
  return (
    TERRAIN_STATS[target.terrain].baseCost *
    (1 + ECONOMY.distanceFactor * dist) *
    Math.pow(ECONOMY.sizeFactor, ownedCount(state)) *
    thrifty *
    effectsAt(state, at).colonizationCost *
    (state.strain === "pleurotus" ? STRAINS.pleurotus.colonizationCost : 1)
  );
}

/** Hyphae growth time in ms, reduced by Croissance des hyphes; `phase` is the day's growth multiplier. */
export function growthDurationMs(terrain: Terrain, upgrades: Upgrades, phase = 1): number {
  const factor = Math.pow(1 - UPGRADE_STATS.hyphalGrowth.perLevel, upgrades.hyphalGrowth) * phase;
  return Math.round(TERRAIN_STATS[terrain].growthSeconds * 1000 * factor);
}

/**
 * Share of the hyphae growth done at `now`, from 0 to 1. It relies on the recorded start so that
 * buying Croissance des hyphes during a growth does not move the progress backwards.
 */
export function growthProgress(tile: Tile, now: number, upgrades: Upgrades): number {
  if (tile.growthEndsAt === null) return tile.owner !== null ? 1 : 0;
  const total =
    tile.growthStartedAt !== null
      ? tile.growthEndsAt - tile.growthStartedAt
      : // Growths started before the start time was recorded: best estimate.
        Math.max(growthDurationMs(tile.terrain, upgrades), tile.growthEndsAt - now);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (tile.growthEndsAt - now) / total));
}

/** Structures the player owns (they make the next one dearer). */
export function structureCount(state: GameState): number {
  let n = 0;
  for (const t of state.tiles.values()) if (t.owner === state.id && t.structure !== null) n++;
  return n;
}

/** Nutrient cost of the next structure: `base × 1.25 ^ structures owned` (GDD §4.1). */
export function structureCost(state: GameState, id: StructureId): number {
  return STRUCTURES.baseCost[id] * Math.pow(STRUCTURES.costGrowth, structureCount(state));
}

export function isStructureId(id: string): id is StructureId {
  return (STRUCTURE_IDS as readonly string[]).includes(id);
}

/** Structures the player may build right now (the Glande needs Enzymes to be unlocked). */
export function structureAvailable(state: GameState, id: StructureId): boolean {
  return id !== "gland" || state.enzymesUnlocked;
}

/** `base × 1.15^level` (GDD §10). */
export function upgradeCost(id: UpgradeId, level: number): number {
  return UPGRADE_STATS[id].baseCost * Math.pow(ECONOMY.upgradeCostGrowth, level);
}

/** Wild tile next to a colonised (fully grown) tile of the network (GDD §2.3). */
export function isAdjacentToNetwork(state: GameState, h: Hex): boolean {
  return hexNeighbors(h).some((n) => isGrown(state, state.tiles.get(hexKey(n))));
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
  if (!canColonizeTerrain(state, tile.terrain)) return { ok: false, error: "impassable" };
  if (TERRAIN_STATS[tile.terrain].paidInEnzymes && !state.enzymesUnlocked) return { ok: false, error: "locked" };
  if (tile.owner === state.id) return { ok: false, error: "already_owned" };
  if (tile.owner !== null) return { ok: false, error: "occupied" };
  if (tile.reservedFor !== null && tile.reservedFor !== state.id) return { ok: false, error: "reserved" };
  if (queueIndex(state, h) >= 0) return { ok: false, error: "already_queued" };
  if (state.queue.length >= QUEUE_MAX) return { ok: false, error: "queue_full" };
  const planned = new Set(state.queue.map(hexKey));
  const reachable = hexNeighbors(h).some((n) => isMine(state, state.tiles.get(hexKey(n))) || planned.has(hexKey(n)));
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

/** Checks building a structure on one of the player's connected tiles (GDD §4.1: one per tile). */
export function checkBuild(state: GameState, h: Hex, id: string): ActionResult {
  if (!isStructureId(id)) return { ok: false, error: "unknown_structure" };
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (!structureAvailable(state, id)) return { ok: false, error: "locked" };
  if (!networkHops(state).has(hexKey(h))) return { ok: false, error: "not_connected" };
  if (tile.structure !== null) return { ok: false, error: "has_structure" };
  if (id === "sclerotium") {
    let n = 0;
    for (const t of state.tiles.values()) if (t.owner === state.id && t.structure === "sclerotium") n++;
    if (n >= STRUCTURES.sclerotiumMax) return { ok: false, error: "structure_limit" };
  }
  if (state.nutrients < structureCost(state, id)) return { ok: false, error: "not_enough_nutrients" };
  return { ok: true };
}

export function build(state: GameState, h: Hex, id: string, now: number): ActionResult {
  const check = checkBuild(state, h, id);
  if (!check.ok || !isStructureId(id)) return check;
  state.nutrients -= structureCost(state, id);
  state.tiles.get(hexKey(h))!.structure = id;
  refreshConnections(state, now); // A Rhizomorphe changes the hops.
  return check;
}

/** Removes a structure (to build another one); nothing is refunded. */
export function demolish(state: GameState, h: Hex, now: number): ActionResult {
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (tile.owner !== state.id) return { ok: false, error: "not_connected" };
  if (tile.structure === null) return { ok: false, error: "no_structure" };
  tile.structure = null;
  refreshConnections(state, now);
  return { ok: true };
}

/** GDD §3: Enzymes appear from the 15th tile or from Tuesday (the second day of the season), and stay. */
export function refreshUnlocks(state: GameState, now: number): void {
  if (state.enzymesUnlocked) return;
  if (ownedCount(state) >= ENZYMES_UNLOCK_TILES || (state.calendar && phaseAt(now).index >= 1)) state.enzymesUnlocked = true;
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
        if (tile.owner !== state.id) continue;
        if (tile.growthEndsAt !== null && tile.growthEndsAt <= t) {
          tile.growthEndsAt = null;
          tile.growthStartedAt = null;
          changed = true;
        }
        if (tile.terrain === "deadwood" && tile.exhaustion >= EXHAUSTION.max - 1e-9) {
          // GDD §2.2: exhausted Dead wood becomes (fresh) Humus.
          tile.terrain = "humus";
          tile.exhaustion = 0;
          changed = true;
        }
        if (tile.disconnectedSince !== null && t - tile.disconnectedSince >= TRANSPORT.witherMs) {
          tile.owner = null;
          tile.structure = null;
          tile.capture = null;
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
    refreshUnlocks(state, t);
    if (t >= to) break;
  }
  refreshUnlocks(state, to);
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
  factor: number;
  nextEvent: number;
  /** Phase multiplier on biomass gains. */
  biomass: number;
  /** Enzymes per ms (before the offline factor). */
  enzymesPerMs: number;
  /** Wear stops counting for production at this level (Usure lente). */
  wearCap: number;
  queueWaiting: boolean;
}

function planWindow(state: GameState, t: number): Window {
  const hops = networkHops(state);
  const bonus = networkBonus(state, hops, t);
  const producers: Producer[] = [];
  let enzymes = 0;
  let next = Infinity;
  let growing = false;
  for (const tile of state.tiles.values()) {
    if (tile.owner !== state.id) continue;
    const lifetime = lifetimeMs(state, tile);
    const d = hops.get(hexKey(tile));
    if (isGrown(state, tile) && d !== undefined) {
      producers.push({ tile, basePerMs: (baseProduction(state, tile, d, t) * bonus) / 1000, lifetime });
      if (tile.structure === "gland") enzymes += glandRate(tile) / 1000;
      // Rounded up to a whole ms so every event time stays an integer (it is stored as a timestamp).
      if (tile.terrain === "deadwood") {
        next = Math.min(next, t + Math.ceil((Math.max(0, EXHAUSTION.max - tile.exhaustion) * lifetime) / EXHAUSTION.max));
      }
    }
    if (tile.growthEndsAt !== null) {
      growing = true;
      next = Math.min(next, tile.growthEndsAt);
    }
    if (tile.disconnectedSince !== null) next = Math.min(next, tile.disconnectedSince + TRANSPORT.witherMs);
  }
  if (state.lastSeenAt !== null && state.lastSeenAt + OFFLINE.fullMs > t) {
    next = Math.min(next, state.lastSeenAt + OFFLINE.fullMs);
  }
  if (state.calendar) next = Math.min(next, nextPhaseChange(t));
  return {
    producers,
    factor: offlineFactor(state, t),
    biomass: effectsAt(state, t).biomass,
    enzymesPerMs: enzymes,
    wearCap: wearCap(state),
    nextEvent: Math.max(next, t),
    queueWaiting: state.queue.length > 0 && !growing,
  };
}

/** Accrues production and updates exhaustion over `dt` ms inside one window. */
function integrate(state: GameState, w: Window, dt: number): void {
  if (dt <= 0) return;
  let produced = 0;
  for (const p of w.producers) {
    // ∫ (1 − min(e(τ), cap)) dτ with e rising at max/lifetime per ms up to EXHAUSTION.max; the player's
    // cap (Usure lente) may stop it from counting earlier.
    const rate = EXHAUSTION.max / p.lifetime;
    const e0 = p.tile.exhaustion;
    const cap = w.wearCap;
    const start = Math.min(e0, cap);
    const rising = e0 >= cap ? 0 : Math.min(dt, (cap - e0) / rate);
    const freshMs = rising * (1 - start) - (rate * rising * rising) / 2 + (dt - rising) * (1 - Math.min(cap, e0 + rate * dt));
    produced += p.basePerMs * freshMs;
    p.tile.exhaustion = Math.min(EXHAUSTION.max, e0 + dt * rate);
  }
  produced *= w.factor;
  state.nutrients += produced;
  state.enzymes += w.enzymesPerMs * dt * w.factor;
  state.biomass += produced * conversionRate(state.upgrades) * w.biomass;
}

/** Marks the player's tiles as connected or disconnected (disconnected ones start withering). */
export function refreshConnections(state: GameState, now: number): void {
  const hops = networkHops(state);
  for (const tile of state.tiles.values()) {
    if (tile.owner !== state.id) continue;
    if (!isGrown(state, tile)) {
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
    if (
      !tile ||
      tile.owner !== null ||
      (tile.reservedFor !== null && tile.reservedFor !== state.id) ||
      !canColonizeTerrain(state, tile.terrain) ||
      !isAdjacentToNetwork(state, tile)
    ) {
      state.queue.shift(); // No longer possible: drop it.
      continue;
    }
    if (TERRAIN_STATS[tile.terrain].paidInEnzymes && !state.enzymesUnlocked) {
      state.queue.shift();
      continue;
    }
    const cost = colonizationCost(state, tile, now);
    const enzymes = TERRAIN_STATS[tile.terrain].paidInEnzymes === true;
    if ((enzymes ? state.enzymes : state.nutrients) < cost) break;
    if (enzymes) state.enzymes -= cost;
    else state.nutrients -= cost;
    tile.owner = state.id;
    tile.capture = null;
    tile.structure = null;
    tile.growthStartedAt = now;
    tile.growthEndsAt = now + growthDurationMs(tile.terrain, state.upgrades, effectsAt(state, now).growthTime * strainGrowthFactor(state));
    tile.disconnectedSince = null;
    state.queue.shift();
    started = true;
  }
  return started;
}

/** Deep copy (tiles included), handy for client-side prediction and tests. */
export function cloneGame(state: GameState): GameState {
  const tiles = new Map<string, Tile>();
  for (const [k, t] of state.tiles) tiles.set(k, { ...t, capture: t.capture && { ...t.capture } });
  return clonePlayer(state, tiles);
}

/** Copy of a player's own fields, on the given tiles. */
export function clonePlayer(state: GameState, tiles: Map<string, Tile>): GameState {
  return {
    ...state,
    spawn: { ...state.spawn },
    heart: { ...state.heart },
    upgrades: { ...state.upgrades },
    mutations: [...state.mutations],
    queue: state.queue.map((h) => ({ ...h })),
    tiles,
  };
}
