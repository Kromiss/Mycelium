import {
  ACTION_EFFECTS,
  ANTI_FRUSTRATION,
  AUTOMATION,
  BUDS,
  COHESION,
  ENRICH,
  CENTRE_RISK,
  ECONOMY,
  FRUITING,
  ENZYMES_UNLOCK_TILES,
  HEART_MOVE_COOLDOWN_MS,
  HUMIDITY,
  MUTATION_BRANCHES,
  MUTATION_IDS,
  MUTATIONS,
  OFFLINE,
  PACTS,
  QUEUE_MAX,
  RELIC_IDS,
  RELICS,
  ROOTS,
  SIGNALS,
  SPORE_COST_GROWTH,
  SPORE_UPGRADE_IDS,
  SPORE_UPGRADES,
  STRUCTURE_IDS,
  STRAIN_IDS,
  STRAINS,
  STRUCTURES,
  TERRAIN_STATS,
  TERRAINS as TERRAIN_IDS,
  TICK_MS,
  TRANSPORT,
  UPGRADE_IDS,
  UPGRADE_STATS,
  ZONES,
  type ActionId,
  type MutationId,
  type RelicId,
  type SporeUpgradeId,
  type StrainId,
  type StructureId,
  type Terrain,
  type UpgradeId,
} from "./balance";
import { richnessAt, ringAt, zoneAt, zoneValue, type MapLayout } from "./forestgen";
import { hexDistance, hexEquals, hexKey, hexNeighbors, type Hex } from "./hex";
import { generateMap, START_HEX } from "./mapgen";
import { asTileOf, hasCutEffects, hasReservoirs, topologyEpoch, makeTile, neighbourhoodVersion, neighbourTiles, networkSignature, ownedCountOf, ownedTilesOf, ownerVersion, tileKey, touchesWetland } from "./tile-index";
import { hashFloat } from "./rng";
import { NEUTRAL_EFFECTS, nextPhaseChange, phaseAt, type PhaseEffects } from "./season";

/**
 * Economy rules of one player (GDD §2.3, §2.4, §3, §9, §10). A player's `GameState` shares its
 * `tiles` with every other player of the forest; a tile belongs to whoever `owner` names. The
 * functions here are the single source of truth: the server runs them with authority, the client
 * runs them on what it can see to display predictions.
 */

export interface Tile extends Hex {
  /** Mutable: events turn tiles into Stumps or Carcasses, a looted Ruine into rubble. */
  terrain: Terrain;
  /** Player who colonised the tile (possibly still growing), null for a wild tile. */
  owner: string | null;
  /** When owned: end of the hyphae growth (ms since epoch), or null once the tile is colonised. */
  growthEndsAt: number | null;
  /** When growing: start of the hyphae growth (ms since epoch); null otherwise or if unknown. */
  growthStartedAt: number | null;
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
  /**
   * Timed effects on the tile: active actions (GDD §6.2) and events. Expired ones are pruned by the forest.
   * The list is replaced, never changed in place (it is frozen on tiles made by `makeTile`).
   */
  effects: readonly TileEffect[];
  /** Enrichissement level (M8, GDD §4.4), 0 on a wild tile; bought by the owner, half kept on capture. */
  level: number;
}

/** A Bourgeon (M8, GDD §4.4) waiting on one of the player's tiles until `until` (ms since epoch). */
export interface Bud {
  q: number;
  r: number;
  until: number;
}

/** Kinds of timed tile effects: active actions, and the Orage and Cendres left by events (M6). */
export type EffectKind = ActionId | "storm" | "ashes";

/** Who casts the effects left by events. */
export const EVENT_CASTER = "event";

/**
 * A timed effect on a tile, cast by `by` (a player id, or EVENT_CASTER) and active until `until` (ms
 * since epoch). `power`: the production bonus of an Orage, the multiplier of Cendres.
 */
export interface TileEffect {
  kind: EffectKind;
  by: string;
  until: number;
  power?: number;
}

/** The first effect of this kind still active at `at`, if any. */
export function activeEffect(tile: Tile, kind: EffectKind, at: number): TileEffect | undefined {
  return tile.effects.find((e) => e.kind === kind && e.until > at);
}

export type Upgrades = Record<UpgradeId, number>;
export type SporeUpgrades = Record<SporeUpgradeId, number>;

/** Automations switched on by the player (GDD §9); each one is unlocked by biomass first. */
export interface Automation {
  /** Auto-colonisation: preferred terrain, "any" for no preference, null when off. */
  colonize: Terrain | "any" | null;
  /** Auto-reinvestment in upgrades. */
  upgrades: boolean;
}

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
  /** Spores from fruiting (GDD §5), spent in the Spore shop. */
  spores: number;
  sporeUpgrades: SporeUpgrades;
  /** Times the player fruited this season. */
  fruitings: number;
  automation: Automation;
  /** The Cœur: nutrients flow to it (GDD §2.4). */
  heart: Hex;
  /** Last time the Cœur was moved, null if never. */
  heartMovedAt: number | null;
  /** After losing the Cœur, it cannot be taken again until then (GDD §6.4); null otherwise. */
  heartShieldUntil: number | null;
  /** When each active action can be used again (GDD §6.2), ms since epoch. */
  cooldowns: Partial<Record<ActionId, number>>;
  /**
   * Nutrients siphoned from this player and not yet handed to the casters (GDD §6.2 Siphon), by caster
   * id. The forest settles it whenever it moves on; never stored.
   */
  siphoned: Record<string, number>;
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
  /** Pacte de symbiose the player belongs to (M7), derived from the forest's pacts; null without one. */
  pact: string | null;
  /** The other members of the player's pact (derived from the forest). */
  allies: string[];
  /** Nutrients put in the pact's pot and not yet shared (the forest settles it; never stored). */
  pactGiven: number;
  /** "Réseau tâché" after a betrayal (GDD §6.3): until then (ms since epoch), null otherwise. */
  taintedUntil: number | null;
  /** Signaux chimiques (GDD §3), made by connected Roots tiles. */
  signals: number;
  /** Signals appear with the player's first Roots tile, and stay. */
  signalsUnlocked: boolean;
  /** Relics chosen this week (M7 Ruins). */
  relics: RelicId[];
  /** Relics earned by looting Ruins and not chosen yet. */
  relicPicks: number;
  /** Networks the player listens to (Écoute), by player id: until when (ms since epoch). */
  listens: Record<string, number>;
  /** Tiles taken from other players this season (M7 "cases conquises" leaderboard). */
  conquests: number;
  /** Active play this season, in ms: connected with an action in the last 10 minutes (M7 efficiency). */
  activeMs: number;
  /** Bourgeons waiting to be picked (M8). */
  buds: Bud[];
  /** When the next Bourgeon grows (ms since epoch), null before the first one is scheduled. */
  nextBudAt: number | null;
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
  | "strain_chosen"
  | "no_carpophore"
  | "invalid_radius"
  | "nothing_to_fruit"
  | "unknown_spore_upgrade"
  | "not_enough_spores"
  | "invalid_automation"
  | "unknown_action"
  | "not_enemy"
  | "no_pvp"
  | "protected"
  | "uncuttable"
  | "action_cooldown"
  | "unknown_player"
  | "self"
  | "tainted"
  | "in_pact"
  | "pact_full"
  | "already_invited"
  | "no_invite"
  | "not_in_pact"
  | "already_leaving"
  | "not_ally"
  | "not_enough_signals"
  | "invalid_amount"
  | "no_relic"
  | "unknown_relic"
  | "relic_owned"
  | "not_productive"
  | "invalid_count"
  | "no_bud";

export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export function emptyUpgrades(): Upgrades {
  return Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Upgrades;
}

export function emptySporeUpgrades(): SporeUpgrades {
  return Object.fromEntries(SPORE_UPGRADE_IDS.map((id) => [id, 0])) as SporeUpgrades;
}

/** Spore shop levels from untrusted data. */
export function normalizeSporeUpgrades(raw: unknown): SporeUpgrades {
  const out = emptySporeUpgrades();
  if (typeof raw === "object" && raw !== null) {
    for (const [id, level] of Object.entries(raw)) {
      if ((SPORE_UPGRADE_IDS as readonly string[]).includes(id) && Number.isInteger(level) && (level as number) >= 0) out[id as SporeUpgradeId] = level as number;
    }
  }
  return out;
}

/** Automation settings from untrusted data. */
export function normalizeAutomation(raw: unknown): Automation {
  const out: Automation = { colonize: null, upgrades: false };
  if (typeof raw === "object" && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (r.colonize === "any" || (typeof r.colonize === "string" && (TERRAIN_IDS as readonly string[]).includes(r.colonize))) out.colonize = r.colonize as Terrain | "any";
    out.upgrades = r.upgrades === true;
  }
  return out;
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
  return makeTile({
    q: h.q,
    r: h.r,
    terrain,
    owner: null,
    growthEndsAt: null,
    growthStartedAt: null,
    disconnectedSince: null,
    capture: null,
    reservedFor: null,
    structure: null,
    toxic: false,
    effects: [],
    level: 0,
  });
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
    start.level = 0;
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
    spores: 0,
    sporeUpgrades: emptySporeUpgrades(),
    fruitings: 0,
    automation: { colonize: null, upgrades: false },
    heart: { q: spawn.q, r: spawn.r },
    heartMovedAt: null,
    heartShieldUntil: null,
    cooldowns: {},
    siphoned: {},
    nutrients: ECONOMY.startingNutrients,
    enzymes: 0,
    enzymesUnlocked: false,
    biomass: 0,
    upgrades: emptyUpgrades(),
    queue: [],
    lastSeenAt: null,
    pact: null,
    allies: [],
    pactGiven: 0,
    taintedUntil: null,
    signals: 0,
    signalsUnlocked: false,
    relics: [],
    relicPicks: 0,
    listens: {},
    conquests: 0,
    activeMs: 0,
    buds: [],
    nextBudAt: null,
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
 * A tile under a Coupure at `at` (GDD §6.2) carries nothing: it and what lies behind it are left out,
 * unless `ignoreCuts`.
 */
export function networkHops(state: GameState, at: number = state.updatedAt, ignoreCuts = false): Map<string, number> {
  // M9 speed-up: without an active Coupure on the player's tiles, the hops only change with the
  // player's tiles and Cœur, so they are kept until one of them changes. The map is shared: never change it.
  const version = networkSignature(state.tiles, state.id);
  if (version === null) return computeHops(state, at, ignoreCuts);
  if (!ignoreCuts && hasActiveCut(state, at)) return computeHops(state, at, false);
  const cached = hopsCache.get(state);
  if (cached && cached.version === version && cached.tiles === state.tiles && hexEquals(cached.heart, state.heart)) return cached.hops;
  const hops = computeHops(state, at, true);
  hopsCache.set(state, { version, tiles: state.tiles, heart: { q: state.heart.q, r: state.heart.r }, hops });
  return hops;
}

/** The hops if `cut` were under a Coupure too (robots weighing a Coupure). */
export function networkHopsWithCut(state: GameState, at: number, cut: Tile): Map<string, number> {
  return computeHops(state, at, false, cut);
}

const hopsCache = new WeakMap<GameState, { version: string; tiles: Map<string, Tile>; heart: Hex; hops: Map<string, number> }>();

/** Some grown tile of the player is under a Coupure at `at`. */
function hasActiveCut(state: GameState, at: number): boolean {
  if (hasCutEffects(state.tiles, state.id) === false) return false;
  for (const t of ownedTilesOf(state.tiles, state.id)) {
    if (t.effects.length > 0 && t.growthEndsAt === null && activeEffect(t, "cut", at) !== undefined) return true;
  }
  return false;
}

function computeHops(state: GameState, at: number, ignoreCuts: boolean, extraCut: Tile | null = null): Map<string, number> {
  const hops = new Map<string, number>();
  const heart = state.tiles.get(hexKey(state.heart));
  if (!heart || !isGrown(state, heart)) return hops;
  const cut = (t: Tile) => t === extraCut || (!ignoreCuts && t.effects.length > 0 && activeEffect(t, "cut", at) !== undefined);
  if (cut(heart)) return hops;
  hops.set(tileKey(state.tiles, heart), 0);
  // 0-1 breadth-first search: free steps go to the front of the deque.
  const deque: Array<[Tile, number]> = [[heart, 0]];
  let head = 0;
  const front: Array<[Tile, number]> = [];
  while (front.length > 0 || head < deque.length) {
    const [h, d] = front.length > 0 ? front.pop()! : deque[head++]!;
    if (d > hops.get(tileKey(state.tiles, h))!) continue;
    for (const t of neighbourTiles(state.tiles, h)) {
      if (!isGrown(state, t) || cut(t)) continue;
      const k = tileKey(state.tiles, t);
      const free = t.structure === "rhizomorph";
      const nd = free ? d : d + 1;
      const known = hops.get(k);
      if (known !== undefined && known <= nd) continue;
      hops.set(k, nd);
      if (free) front.push([t, nd]);
      else deque.push([t, nd]);
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
  const wet = touchesWetland(state.tiles, h);
  if (wet !== null) {
    if (wet) return 1 + HUMIDITY.wetlandBonus;
    if (hasReservoirs(state.tiles) === false) return 1;
    for (const t of neighbourTiles(state.tiles, h as Tile)) if (t.structure === "reservoir" && isGrown(state, t)) return 1 + HUMIDITY.wetlandBonus;
    return 1;
  }
  for (const n of hexNeighbors(h)) {
    const t = state.tiles.get(hexKey(n));
    if (t !== undefined && (t.terrain === "wetland" || (t.structure === "reservoir" && isGrown(state, t)))) return 1 + HUMIDITY.wetlandBonus;
  }
  return 1;
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
  const relic = state.relics.includes("insight") ? RELICS.insight : 0;
  return earnedMutationPoints(state.biomass) + state.sporeUpgrades.mutationPoint + relic - state.mutations.length;
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

/** Multiplier on the player's Roots (Mycorhize). */
export function rootsFactor(state: GameState): number {
  return hasMutation(state, "mycorrhiza") ? MUTATIONS.mycorrhiza : 1;
}

/** Yield multiplier of a terrain for the player (Saprophyte, Roots). */
export function terrainFactor(state: GameState, terrain: Terrain): number {
  if ((terrain === "deadwood" || terrain === "stump") && hasMutation(state, "saprophyte")) return 1 + MUTATIONS.saprophyte;
  if (terrain === "roots") return rootsFactor(state);
  return 1;
}

/** Hyphae growth time multiplier at `at`: the day's phase, the Spore shop and the Hâte relic. */
export function growthTimeFactor(state: GameState, at: number): number {
  const spores = Math.pow(1 - SPORE_UPGRADES.growth.perLevel, state.sporeUpgrades.growth);
  const relic = state.relics.includes("haste") ? 1 - RELICS.haste : 1;
  return effectsAt(state, at).growthTime * spores * relic;
}

/** Border pressure multiplier (Hyphes agressives, Cordyceps +20 %, Armillaire −10 %). */
export function pressureFactor(state: GameState): number {
  const strain = state.strain === "cordyceps" ? STRAINS.cordyceps.pressure : state.strain === "armillaria" ? STRAINS.armillaria.pressure : 1;
  return (hasMutation(state, "aggressiveHyphae") ? 1 + MUTATIONS.aggressiveHyphae : 1) * strain;
}

/** Speed at which the player's tiles are taken (Résilience; Armillaire: captures 30 % longer). */
export function capturedFactor(state: GameState): number {
  return (hasMutation(state, "resilience") ? MUTATIONS.resilience : 1) * (state.strain === "armillaria" ? 1 / STRAINS.armillaria.capturedTime : 1);
}

/** Multiplier on the pressure others push on the player's tiles (Armillaire: −15 %). */
export function pressureTakenFactor(state: GameState): number {
  return state.strain === "armillaria" ? STRAINS.armillaria.pressureTaken : 1;
}

/** Multiplier on the speed of the player's captures (Cordyceps: +15 %). */
export function captureSpeedFactor(state: GameState): number {
  return state.strain === "cordyceps" ? STRAINS.cordyceps.captureSpeed : 1;
}

/** Conquest bonus multiplier (Pillage, Cordyceps). */
export function conquestFactor(state: GameState): number {
  return (hasMutation(state, "plunder") ? MUTATIONS.plunder : 1) * (state.strain === "cordyceps" ? STRAINS.cordyceps.conquestBonus : 1);
}

/**
 * Production multiplier from mutations, strain and Spores that does not depend on the map (Enzymes
 * digestives, Cordyceps, Armillaire, Spore shop).
 */
export function traitProduction(state: GameState, at: number): number {
  let m = hasMutation(state, "digestiveEnzymes") ? 1 + MUTATIONS.digestiveEnzymes : 1;
  m *= 1 + SPORE_UPGRADES.production.perLevel * state.sporeUpgrades.production;
  if (state.strain === "cordyceps") m *= STRAINS.cordyceps.production;
  if (state.strain === "armillaria" && state.calendar) m *= STRAINS.armillaria.monday + STRAINS.armillaria.perDay * phaseAt(at).index;
  if (state.relics.includes("vigour")) m *= 1 + RELICS.vigour;
  if (isTainted(state, at)) m *= 1 - PACTS.taintProduction;
  return m;
}

/** "Réseau tâché" (GDD §6.3): the player betrayed a pact less than a day ago. */
export function isTainted(state: GameState, at: number): boolean {
  return state.taintedUntil !== null && at < state.taintedUntil;
}

/** Témérité: +3 % per tile of the player touching an enemy's tile (allies do not count), up to +30 %. */
export function temerityFactor(state: GameState): number {
  if (!hasMutation(state, "temerity")) return 1;
  // The border only changes with the owners around (M9 speed-up: kept until a tile changes hands).
  const epoch = topologyEpoch(state.tiles);
  const allies = state.allies.join(",");
  const known = temerities.get(state);
  if (epoch !== null && known && known.epoch === epoch && known.allies === allies && known.tiles === state.tiles) return known.value;
  const value = computeTemerity(state);
  if (epoch !== null) temerities.set(state, { epoch, allies, tiles: state.tiles, value });
  return value;
}
const temerities = new WeakMap<GameState, { epoch: number; allies: string; tiles: Map<string, Tile>; value: number }>();

function computeTemerity(state: GameState): number {
  let border = 0;
  for (const t of ownedTilesOf(state.tiles, state.id)) {
    if (t.growthEndsAt !== null) continue;
    if (neighbourTiles(state.tiles, t).some((n) => {
      const o = n.owner;
      return o !== null && o !== state.id && !state.allies.includes(o);
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

/** Zone of a tile (M9: 1 on the forest rim to 7 in the centre; 1 on solo maps). */
export function zone(state: GameState, h: Hex): number {
  return zoneAt(state.layout, state.radius, h);
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

const rootsCounted = new WeakMap<Map<string, number>, number>();
const rootsCountedTiles = new WeakMap<Map<string, number>, Map<string, Tile>>();

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
  // The count only changes with the hops map (a new map whenever the player's tiles change).
  let roots = rootsCounted.get(hops);
  if (roots === undefined || rootsCountedTiles.get(hops) !== state.tiles) {
    roots = 0;
    for (const k of hops.keys()) if (state.tiles.get(k)!.terrain === "roots") roots++;
    if (ownerVersion(state.tiles, state.id) !== null) {
      rootsCounted.set(hops, roots);
      rootsCountedTiles.set(hops, state.tiles);
    }
  }
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
  const d = hops.get(tileKey(state.tiles, tile));
  if (!isGrown(state, tile) || d === undefined) return 0;
  const siphon = siphonedBy(tile, state.id, at) !== null ? 1 - ACTION_EFFECTS.siphonShare : 1;
  return cachedBaseProduction(state, productionCache(state, at), tile, d, at) * bonus * siphon;
}

/** Who siphons this tile of `owner` at `at` (GDD §6.2 Siphon), null if nobody. */
export function siphonedBy(tile: Tile, owner: string, at: number): string | null {
  if (tile.effects.length === 0) return null;
  const e = tile.effects.find((x) => x.kind === "siphon" && x.until > at && x.by !== owner);
  return e ? e.by : null;
}

/** The tile lies in the centre of a forest (GDD §2.5 war zone). */
export function inForestCentre(state: GameState, h: Hex): boolean {
  return state.layout.kind === "forest" && ringAt(state.radius, h) === "centre";
}

/** Biomass multiplier of what a tile produces: ×1.5 in the forest centre (GDD §2.5 risk). */
export function placeBiomass(state: GameState, h: Hex): number {
  if (state.layout.kind !== "forest") return 1;
  return inForestCentre(state, h) ? CENTRE_RISK.biomass : 1;
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
    (tile.toxic ? 1 - MUTATIONS.toxins : 1) *
    (tile.effects.length > 0 ? effectProduction(tile, at) : 1) *
    tileGrowthFactor(state.tiles, tile, cohesionRate(state))
  );
}

/** Production multiplier of a tile's timed effects: Toxine, Orage, Cendres. */
export function effectProduction(tile: Tile, at: number): number {
  let m = activeEffect(tile, "toxin", at) ? ACTION_EFFECTS.toxinProduction : 1;
  const storm = activeEffect(tile, "storm", at);
  if (storm) m *= 1 + (storm.power ?? 0);
  const ashes = activeEffect(tile, "ashes", at);
  if (ashes) m *= ashes.power ?? 1;
  return m;
}

// ---------------------------------------------------------------------------
// M8 — cohesion, enrichment and buds (GDD §2.3, §4.4)

/** Grown tiles of the tile's owner among its six neighbours: its Cohésion, 0 to 6. */
export function cohesion(tiles: Map<string, Tile>, tile: Hex & { owner: string | null }): number {
  const owner = tile.owner;
  if (owner === null) return 0;
  let n = 0;
  const self = asTileOf(tiles, tile);
  if (self !== undefined) {
    for (const t of neighbourTiles(tiles, self)) if (t.owner === owner && t.growthEndsAt === null) n++;
    return n;
  }
  for (const h of hexNeighbors(tile)) {
    const t = tiles.get(hexKey(h));
    if (t !== undefined && t.owner === owner && t.growthEndsAt === null) n++;
  }
  return n;
}

/** A Rosace: all six neighbours belong to the same colony (it cannot be cut; its levels count more). */
export function isRosette(tiles: Map<string, Tile>, tile: Hex & { owner: string | null }): boolean {
  return cohesion(tiles, tile) === 6;
}

/** Production multiplier of a tile from its cohesion: +5 % per neighbour of the same colony (+7.5 % with Mycélium dense). */
export function cohesionProduction(neighbours: number, perNeighbour: number = COHESION.production): number {
  return 1 + perNeighbour * neighbours;
}

/** Production bonus of each neighbour of the same colony for the player (Mycélium dense, M9). */
export function cohesionRate(state: GameState): number {
  return hasMutation(state, "denseMycelium") ? MUTATIONS.denseMycelium : COHESION.production;
}

/** Milestones (levels 10, 25, 50, 100, then every 100) a tile has reached: each doubles its production. */
export function milestonesReached(level: number): number {
  let m = 0;
  for (const x of ENRICH.milestones) if (level >= x) m++;
  const last = ENRICH.milestones[ENRICH.milestones.length - 1]!;
  if (level > last) m += Math.floor((level - last) / ENRICH.milestoneEvery);
  return m;
}

/** The next milestone above `level`. */
export function nextMilestone(level: number): number {
  for (const x of ENRICH.milestones) if (level < x) return x;
  const last = ENRICH.milestones[ENRICH.milestones.length - 1]!;
  return last + (Math.floor((level - last) / ENRICH.milestoneEvery) + 1) * ENRICH.milestoneEvery;
}

/** Production multiplier of an enrichment level: `(1 + 8 % × level) × 2 ^ milestones`, its bonus +10 % on a Rosace. */
export function enrichFactor(level: number, rosette = false): number {
  if (level <= 0) return 1;
  const f = (1 + ENRICH.perLevel * level) * Math.pow(2, milestonesReached(level));
  return rosette ? 1 + (f - 1) * (1 + COHESION.rosetteEnrich) : f;
}

/** Everything a tile's neighbours and levels add to its production (M8): cohesion × enrichment. */
export function tileGrowthFactor(tiles: Map<string, Tile>, tile: Tile, perNeighbour: number = COHESION.production): number {
  const n = cohesion(tiles, tile);
  return cohesionProduction(n, perNeighbour) * enrichFactor(tile.level, n === 6);
}

/** Tiles that can be enriched: those that produce nutrients (not Rock, Ruins or rubble). */
export function isEnrichable(tile: { terrain: Terrain }): boolean {
  return TERRAIN_STATS[tile.terrain].yieldPerSecond > 0;
}

/**
 * `base_case`: a share of the tile's base price at the colony's size (`baseCost × 1.13 ^ nb_cases`), so a
 * level costs a fraction of a new tile, and gets dearer as the colony grows (M8, tuned).
 */
export function enrichBaseCost(state: GameState, tile: Tile, owned: number = ownedCount(state)): number {
  if (!isEnrichable(tile)) return 0;
  // Digestion profonde (M9): 15 % cheaper.
  const deep = hasMutation(state, "deepDigestion") ? 1 - MUTATIONS.deepDigestion : 1;
  return TERRAIN_STATS[tile.terrain].baseCost * sizePower(owned) * ENRICH.baseShare * deep;
}

/** `sizeFactor ^ owned`, remembered for the last few sizes (the same few sizes come back all the time). */
function sizePower(owned: number): number {
  let v = sizePowers.get(owned);
  if (v === undefined) {
    v = Math.pow(ECONOMY.sizeFactor, owned);
    if (sizePowers.size > 4096) sizePowers.clear();
    sizePowers.set(owned, v);
  }
  return v;
}
const sizePowers = new Map<number, number>();

/** Nutrients for the next `levels` levels of a tile: `base_case × 1.12 ^ level` each. */
export function enrichCost(state: GameState, tile: Tile, levels = 1, owned: number = ownedCount(state)): number {
  const base = enrichBaseCost(state, tile, owned);
  const g = ENRICH.costGrowth;
  return (base * Math.pow(g, tile.level) * (Math.pow(g, levels) - 1)) / (g - 1);
}

/** Nutrients spent so far on a tile's levels (they count in the value of a fruiting). */
export function enrichSpent(state: GameState, tile: Tile): number {
  if (tile.level <= 0 || !isEnrichable(tile)) return 0;
  const g = ENRICH.costGrowth;
  return (enrichBaseCost(state, tile) * (Math.pow(g, tile.level) - 1)) / (g - 1);
}

/** Levels the player can pay for on this tile right now, up to `max`. */
export function affordableLevels(state: GameState, tile: Tile, max: number = ENRICH.maxBatch): number {
  const base = enrichBaseCost(state, tile) * Math.pow(ENRICH.costGrowth, tile.level);
  if (base <= 0) return 0;
  const g = ENRICH.costGrowth;
  // Largest n with base × (g^n − 1) / (g − 1) ≤ nutrients.
  const n = Math.floor(Math.log(1 + (Math.max(0, state.nutrients) * (g - 1)) / base) / Math.log(g) + 1e-9);
  let out = Math.max(0, Math.min(max, n));
  while (out > 0 && enrichCost(state, tile, out) > state.nutrients) out--;
  return out;
}

/** Checks enriching a tile: the player's own, grown, connected and productive, and at least one level paid. */
export function checkEnrich(state: GameState, h: Hex, hops: Map<string, number> = networkHops(state)): ActionResult {
  const tile = state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (!isMine(state, tile) || tile.growthEndsAt !== null || !hops.has(hexKey(tile))) return { ok: false, error: "not_connected" };
  if (!isEnrichable(tile)) return { ok: false, error: "not_productive" };
  if (state.nutrients < enrichCost(state, tile)) return { ok: false, error: "not_enough_nutrients" };
  return { ok: true };
}

/**
 * Enriches a tile (GDD §4.4): buys up to `count` levels, as many as the nutrients pay for ("×1", "×10"),
 * or as many as possible with "max".
 */
export function enrich(state: GameState, h: Hex, count: number | "max"): ActionResult {
  if (count !== "max" && (!Number.isInteger(count) || count < 1 || count > ENRICH.maxBatch)) return { ok: false, error: "invalid_count" };
  const check = checkEnrich(state, h);
  if (!check.ok) return check;
  const tile = state.tiles.get(hexKey(h))!;
  const n = affordableLevels(state, tile, count === "max" ? ENRICH.maxBatch : count);
  state.nutrients -= enrichCost(state, tile, n);
  tile.level += n;
  return check;
}

/**
 * "Enrichir tout le bloc" (GDD §4.4): one level on the tile and on each of its connected neighbours of the
 * same colony, cheapest first, while the nutrients last.
 */
export function enrichBlock(state: GameState, h: Hex): ActionResult {
  const hops = networkHops(state);
  const centre = state.tiles.get(hexKey(h));
  if (!centre) return { ok: false, error: "unknown_tile" };
  if (!isMine(state, centre) || centre.growthEndsAt !== null || !hops.has(hexKey(centre))) return { ok: false, error: "not_connected" };
  const block = [centre, ...hexNeighbors(centre).map((n) => state.tiles.get(hexKey(n)))].filter(
    (t): t is Tile => t !== undefined && isMine(state, t) && t.growthEndsAt === null && hops.has(hexKey(t)) && isEnrichable(t),
  );
  if (block.length === 0) return { ok: false, error: "not_productive" };
  block.sort((a, b) => enrichCost(state, a) - enrichCost(state, b));
  let bought = 0;
  for (const t of block) {
    const cost = enrichCost(state, t);
    if (state.nutrients < cost) break;
    state.nutrients -= cost;
    t.level += 1;
    bought++;
  }
  return bought > 0 ? { ok: true } : { ok: false, error: "not_enough_nutrients" };
}

/**
 * Nutrients per second (fresh terms, before the network bonus, the phase and transport) that the tile's
 * next level adds, per nutrient it costs: what sets one tile apart from another for enrichment.
 */
export function enrichPayback(state: GameState, t: Tile, owned: number = ownedCount(state)): number {
  return enrichScore(state, t) / sizePower(owned);
}

/**
 * `enrichPayback` without the colony's size, which every tile shares (its cost grows with
 * `sizeFactor ^ nb_cases`): kept per tile until its level, its neighbours or the player's upgrades,
 * mutations or strain change (M9 speed-up).
 */
function enrichScore(state: GameState, t: Tile, cache: EnrichCache = enrichCache(state)): number {
  if (!isEnrichable(t)) return 0;
  const around = neighbourhoodVersion(state.tiles, t);
  const e = around === null ? undefined : cache.entries.get(t);
  if (e !== undefined && e.level === t.level && e.around === around) return e.value;
  const n = cohesion(state.tiles, t);
  const now = enrichFactor(t.level, n === 6);
  const yieldNow =
    tileYield(t.terrain, state.upgrades) * terrainFactor(state, t.terrain) * richness(state, t) * humidity(state, t) * cohesionProduction(n, cohesionRate(state)) * now;
  const value = (yieldNow * (enrichFactor(t.level + 1, n === 6) / now - 1)) / (enrichBaseCost(state, t, 0) * Math.pow(ENRICH.costGrowth, t.level));
  if (around !== null) cache.entries.set(t, { level: t.level, around, value });
  return value;
}

interface EnrichCache {
  digestion: number;
  wood: number;
  mutations: string;
  strain: StrainId | null;
  tiles: Map<string, Tile>;
  entries: Map<Tile, { level: number; around: number; value: number }>;
}
const enrichScores = new WeakMap<GameState, EnrichCache>();

function enrichCache(state: GameState): EnrichCache {
  let cache = enrichScores.get(state);
  if (
    !cache ||
    cache.digestion !== state.upgrades.digestion ||
    cache.wood !== state.upgrades.woodDecomposer ||
    cache.strain !== state.strain ||
    cache.tiles !== state.tiles ||
    cache.mutations !== mutationKey(state)
  ) {
    cache = { digestion: state.upgrades.digestion, wood: state.upgrades.woodDecomposer, mutations: mutationKey(state), strain: state.strain, tiles: state.tiles, entries: new Map() };
    enrichScores.set(state, cache);
  }
  return cache;
}

/** The player's mutations as one string, rebuilt only when the list changes. */
function mutationKey(state: GameState): string {
  const m = state.mutations;
  const k = mutationKeys.get(state);
  if (k && k.list === m && k.length === m.length) return k.key;
  const key = m.join(",");
  mutationKeys.set(state, { list: m, length: m.length, key });
  return key;
}
const mutationKeys = new WeakMap<GameState, { list: MutationId[]; length: number; key: string }>();

/**
 * The tile whose next level pays back best, for auto-reinvestment: production gained per nutrient, from
 * what sets a tile apart (terrain, place, cohesion, level, wear); what every tile shares (network
 * bonus, phase) does not change the choice. Connected tiles only.
 */
export function autoEnrichTarget(state: GameState, at: number): Tile | null {
  const hops = networkHops(state, at);
  const cache = enrichCache(state);
  let best: Tile | null = null;
  let bestRatio = 0;
  for (const k of hops.keys()) {
    const t = state.tiles.get(k)!;
    if (!isEnrichable(t)) continue;
    // The colony's size divides every tile alike: it does not change the choice.
    const ratio = enrichScore(state, t, cache);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = t;
    }
  }
  return best;
}

/** A 32-bit hash of a player id, to draw their buds. */
function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Delay before the bud after the one at `at`: 2 to 4 minutes, drawn from the player and the time. */
function budGap(state: GameState, at: number): number {
  const x = hashFloat(state.seed, idHash(state.id), Math.floor(at / 1000), 1);
  return Math.round(BUDS.minEveryMs + x * (BUDS.maxEveryMs - BUDS.minEveryMs));
}

/**
 * Grows and fades Bourgeons up to `to` (GDD §4.4). They grow every 2 to 4 minutes whether the player is
 * there or not, on a random grown tile of theirs, and fade after 5 minutes. Draws depend only on the
 * player, the forest seed and the time, so the result does not depend on how often this is called.
 */
export function refreshBuds(state: GameState, to: number): void {
  state.buds = state.buds.filter((b) => {
    const t = state.tiles.get(hexKey(b));
    return b.until > to && t !== undefined && t.owner === state.id && t.growthEndsAt === null;
  });
  let at: number = state.nextBudAt ?? state.joinedAt + budGap(state, state.joinedAt);
  while (at <= to) {
    // Only the buds still alive at `to` need a place.
    if (at + BUDS.lifeMs > to) growBud(state, at);
    at += budGap(state, at);
  }
  state.nextBudAt = at;
}

/** Every tile of a map, as an array (the set of tiles never changes, only their content). */
const tileLists = new WeakMap<Map<string, Tile>, Tile[]>();
function tileList(tiles: Map<string, Tile>): Tile[] {
  let list = tileLists.get(tiles);
  if (!list || list.length !== tiles.size) {
    list = [...tiles.values()];
    tileLists.set(tiles, list);
  }
  return list;
}

/**
 * Puts a bud on a random grown, productive tile of the player: tiles of the map are drawn at random
 * until one fits (fast on a shared forest), then, failing that, among all the player's tiles.
 */
function growBud(state: GameState, at: number): void {
  const taken = new Set(state.buds.map(hexKey));
  const fits = (t: Tile) => t.owner === state.id && t.growthEndsAt === null && isEnrichable(t) && !taken.has(hexKey(t));
  const all = tileList(state.tiles);
  const seedHash = idHash(state.id);
  const second = Math.floor(at / 1000);
  let spot: Tile | undefined;
  for (let i = 0; i < 64 && !spot; i++) {
    const t = all[Math.floor(hashFloat(state.seed, seedHash, second, 2, i) * all.length)]!;
    if (fits(t)) spot = t;
  }
  if (!spot) {
    const spots = all.filter(fits);
    if (spots.length === 0) return;
    spot = spots[Math.floor(hashFloat(state.seed, seedHash, second, 3) * spots.length)]!;
  }
  state.buds.push({ q: spot.q, r: spot.r, until: at + BUDS.lifeMs });
  if (state.buds.length > BUDS.max) state.buds.shift();
}

/** What picking a bud gives right now: `BUDS.rewardSeconds` of the player's production. */
export function budReward(state: GameState, at: number = state.updatedAt): { nutrients: number; biomass: number } {
  const nutrients = productionRate(state, at) * BUDS.rewardSeconds;
  return { nutrients, biomass: nutrients * biomassConversion(state) * effectsAt(state, at).biomass };
}

/** Picks a Bourgeon (GDD §4.4): nutrients and the biomass they are worth, at once. */
export function pickBud(state: GameState, h: Hex, now: number): ActionResult {
  const i = state.buds.findIndex((b) => hexEquals(b, h) && b.until > now);
  if (i < 0) return { ok: false, error: "no_bud" };
  const reward = budReward(state, now);
  state.buds.splice(i, 1);
  state.nutrients += reward.nutrients;
  state.biomass += reward.biomass;
  return { ok: true };
}

/** Total nutrients per second right now (GDD §10 `production_totale`), including the offline factor. */
export function productionRate(state: GameState, at: number = state.updatedAt): number {
  const hops = networkHops(state, at);
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
  const hops = networkHops(state, at);
  let total = 0;
  for (const k of hops.keys()) {
    const t = state.tiles.get(k)!;
    if (t.structure === "gland") total += glandRate(t);
  }
  return total * offlineFactor(state, at);
}

/** Biomass gained per second right now (the score), phase and centre bonus included (0 once the season is frozen). */
export function biomassRate(state: GameState, at: number = state.updatedAt): number {
  const hops = networkHops(state, at);
  const bonus = networkBonus(state, hops, at);
  let total = 0;
  for (const k of hops.keys()) {
    const t = state.tiles.get(k)!;
    total += tileProduction(state, t, hops, at, bonus) * placeBiomass(state, t);
  }
  return total * offlineFactor(state, at) * biomassConversion(state) * effectsAt(state, at).biomass;
}

/** Share of the player's production credited as Biomass: upgrades and Spore shop. */
export function biomassConversion(state: GameState): number {
  return conversionRate(state.upgrades) * (1 + SPORE_UPGRADES.conversion.perLevel * state.sporeUpgrades.conversion);
}

/** Share of the production credited as Biomass (GDD §10 `taux_conversion`). */
export function conversionRate(upgrades: Upgrades): number {
  return ECONOMY.biomassConversionRate * (1 + UPGRADE_STATS.biomassConversion.perLevel * upgrades.biomassConversion);
}

/** Tiles owned by the player, growing ones included (the `nb_cases` of the cost formula). */
export function ownedCount(state: GameState): number {
  return ownedCountOf(state.tiles, state.id);
}

/** The player's tiles, growing ones included, in map order. Do not change the returned array. */
export function ownedTiles(state: GameState): readonly Tile[] {
  return ownedTilesOf(state.tiles, state.id);
}

export function growingTiles(state: GameState): Tile[] {
  return ownedTiles(state).filter((t) => t.growthEndsAt !== null);
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
    sizePower(ownedCount(state)) *
    thrifty *
    effectsAt(state, at).colonizationCost *
    zoneValue(ZONES.cost, zone(state, target))
  );
}

/**
 * Hyphae growth time of a tile for the player if it starts at `at`: the terrain's, the zone's (M9) and the
 * player's multipliers.
 */
export function growthTimeMs(state: GameState, tile: Hex & { terrain: Terrain }, at: number = state.updatedAt): number {
  return growthDurationMs(tile.terrain, state.upgrades, growthTimeFactor(state, at) * zoneValue(ZONES.growth, zone(state, tile)));
}

/** Hyphae growth time in ms, reduced by Croissance des hyphes; `phase` is the day's growth multiplier (and the zone's). */
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
  for (const t of ownedTiles(state)) if (t.structure !== null) n++;
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
  const tile = asTileOf(state.tiles, h) ?? state.tiles.get(hexKey(h));
  if (tile !== undefined) return neighbourTiles(state.tiles, tile).some((t) => isGrown(state, t));
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
  const tile = asTileOf(state.tiles, h) ?? state.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (!canColonizeTerrain(state, tile.terrain)) return { ok: false, error: "impassable" };
  if (TERRAIN_STATS[tile.terrain].paidInEnzymes && !state.enzymesUnlocked) return { ok: false, error: "locked" };
  if (tile.owner === state.id) return { ok: false, error: "already_owned" };
  if (tile.owner !== null) return { ok: false, error: "occupied" };
  if (tile.reservedFor !== null && tile.reservedFor !== state.id) return { ok: false, error: "reserved" };
  if (queueIndex(state, h) >= 0) return { ok: false, error: "already_queued" };
  if (state.queue.length >= QUEUE_MAX) return { ok: false, error: "queue_full" };
  // Next to one of the player's tiles, or to a tile of the queue (queued tiles are always on the map).
  const reachable = neighbourTiles(state.tiles, tile).some((n) => n.owner === state.id) || state.queue.some((q) => hexDistance(q, tile) === 1);
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
    for (const t of ownedTiles(state)) if (t.structure === "sclerotium") n++;
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

// ---------------------------------------------------------------------------
// Fruiting, Spores and automations (GDD §5, §9)

/** The player's grown, connected Carpophores (GDD §4.1: needed to fruit). */
export function carpophores(state: GameState, hops: Map<string, number> = networkHops(state)): number {
  let n = 0;
  for (const k of hops.keys()) if (state.tiles.get(k)!.structure === "carpophore") n++;
  return n;
}

export interface FruitingPreview {
  /** Tiles released: the player's tiles farther than `radius` from the Cœur. */
  lost: Tile[];
  /** Their value: what colonising them costs right now. */
  value: number;
  spores: number;
}

/**
 * What fruiting with this radius would give (GDD §5): `floor((value / 1e4) ^ 0.6)` Spores, +25 % per
 * connected Carpophore, the value being the current colonisation cost of every tile given up.
 */
export function fruitingPreview(state: GameState, radius: number, at: number = state.updatedAt): FruitingPreview {
  const lost = ownedTiles(state).filter((t) => hexDistance(state.heart, t) > radius);
  let value = 0;
  for (const t of lost) {
    if (!TERRAIN_STATS[t.terrain].paidInEnzymes) value += colonizationCost(state, t, at);
    // M8: what was spent enriching the tiles given up counts too.
    value += enrichSpent(state, t) * FRUITING.enrichWeight;
  }
  const base = Math.pow(value / FRUITING.valueDivisor, FRUITING.exponent);
  const spores = Math.floor(base * (1 + STRUCTURES.carpophoreSporeBonus * carpophores(state)));
  return { lost, value, spores };
}

export function checkFructify(state: GameState, radius: number): ActionResult {
  if (!Number.isInteger(radius) || radius < FRUITING.minRadius || radius > 1000) return { ok: false, error: "invalid_radius" };
  if (carpophores(state) === 0) return { ok: false, error: "no_carpophore" };
  if (!fruitingPreview(state, radius).lost.length) return { ok: false, error: "nothing_to_fruit" };
  return { ok: true };
}

/**
 * Fruits (GDD §5): every tile farther than `radius` from the Cœur is released for the neighbours, in
 * exchange for Spores. The season's biomass is kept, and colonising is cheap again.
 */
export function fructify(state: GameState, radius: number, now: number): ActionResult {
  const check = checkFructify(state, radius);
  if (!check.ok) return check;
  const { lost, spores } = fruitingPreview(state, radius, now);
  for (const t of lost) {
    t.owner = null;
    t.structure = null;
    t.effects = [];
    t.growthEndsAt = null;
    t.growthStartedAt = null;
    t.disconnectedSince = null;
    t.capture = null;
    t.level = 0;
  }
  state.queue = [];
  state.spores += spores;
  state.fruitings += 1;
  refreshConnections(state, now);
  return check;
}

export function sporeUpgradeCost(id: SporeUpgradeId, level: number): number {
  return SPORE_UPGRADES[id].baseCost * Math.pow(SPORE_COST_GROWTH, level);
}

export function checkBuySporeUpgrade(state: GameState, id: string): ActionResult {
  if (!(SPORE_UPGRADE_IDS as readonly string[]).includes(id)) return { ok: false, error: "unknown_spore_upgrade" };
  const upgrade = id as SporeUpgradeId;
  if (state.spores < sporeUpgradeCost(upgrade, state.sporeUpgrades[upgrade])) return { ok: false, error: "not_enough_spores" };
  return { ok: true };
}

/** Buys a Spore shop level: a bonus for the rest of the week. */
export function buySporeUpgrade(state: GameState, id: string): ActionResult {
  const check = checkBuySporeUpgrade(state, id);
  if (!check.ok) return check;
  const upgrade = id as SporeUpgradeId;
  state.spores -= sporeUpgradeCost(upgrade, state.sporeUpgrades[upgrade]);
  state.sporeUpgrades[upgrade] += 1;
  return check;
}

/** Automations the season's biomass has unlocked (GDD §9). */
export function automationUnlocked(state: GameState): { colonize: boolean; upgrades: boolean } {
  return { colonize: state.biomass >= AUTOMATION.colonizeAt, upgrades: state.biomass >= AUTOMATION.upgradesAt };
}

/** Switches automations on or off; each one must be unlocked first. */
export function setAutomation(state: GameState, change: Partial<Automation>, now: number): ActionResult {
  const unlocked = automationUnlocked(state);
  if (change.colonize !== undefined) {
    const c = change.colonize;
    if (c !== null && c !== "any" && !(TERRAIN_IDS as readonly string[]).includes(c)) return { ok: false, error: "invalid_automation" };
    if (c !== null && !unlocked.colonize) return { ok: false, error: "locked" };
  }
  if (change.upgrades === true && !unlocked.upgrades) return { ok: false, error: "locked" };
  if (change.colonize !== undefined) state.automation.colonize = change.colonize;
  if (change.upgrades !== undefined) state.automation.upgrades = change.upgrades;
  startQueued(state, now);
  return { ok: true };
}

/**
 * Auto-colonisation: the cheapest wild tile next to the network, of the preferred terrain when there
 * is one (paid in nutrients only). Null when nothing can be colonised.
 */
export function autoColonizeTarget(state: GameState, at: number): Tile | null {
  const pref = state.automation.colonize;
  let best: Tile | null = null;
  let bestKey: [number, number, string] | null = null;
  const seen = new Set<Tile>();
  for (const t of ownedTiles(state)) {
    if (t.growthEndsAt !== null) continue;
    for (const c of neighbourTiles(state.tiles, t)) {
      if (seen.has(c)) continue;
      seen.add(c);
      const k = tileKey(state.tiles, c);
      if (c.owner !== null || (c.reservedFor !== null && c.reservedFor !== state.id)) continue;
      if (!canColonizeTerrain(state, c.terrain) || TERRAIN_STATS[c.terrain].paidInEnzymes) continue;
      const key: [number, number, string] = [pref === null || pref === "any" || c.terrain === pref ? 0 : 1, colonizationCost(state, c, at), k];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
        best = c;
        bestKey = key;
      }
    }
  }
  return best;
}

/**
 * Auto-reinvestment: buys the cheapest upgrades while the nutrients left still pay for the next
 * colonisation of the queue. Returns true if something was bought.
 */
function autoInvest(state: GameState, at: number): boolean {
  if (!state.automation.upgrades || !automationUnlocked(state).upgrades) return false;
  const head = state.queue[0] ? state.tiles.get(hexKey(state.queue[0])) : undefined;
  const reserve = head && head.owner === null && !TERRAIN_STATS[head.terrain].paidInEnzymes ? colonizationCost(state, head, at) : 0;
  let bought = false;
  // M8: one tile enriched per minute at most (GDD §4.4), on the minute grid so that the result does not
  // depend on how often the game is advanced.
  if (at % ENRICH.autoEveryMs === 0) {
    const target = autoEnrichTarget(state, at);
    if (target && state.nutrients - enrichCost(state, target) >= reserve) {
      state.nutrients -= enrichCost(state, target);
      target.level += 1;
      bought = true;
    }
  }
  for (;;) {
    let cheapest: UpgradeId | null = null;
    for (const id of UPGRADE_IDS) if (cheapest === null || upgradeCost(id, state.upgrades[id]) < upgradeCost(cheapest, state.upgrades[cheapest])) cheapest = id;
    const cost = upgradeCost(cheapest!, state.upgrades[cheapest!]);
    if (state.nutrients - cost < reserve) return bought;
    state.nutrients -= cost;
    state.upgrades[cheapest!] += 1;
    bought = true;
  }
}

/**
 * GDD §3: Enzymes appear from the 15th tile or from Tuesday (the second day of the season), Signals with
 * the first colonised Roots tile; both stay.
 */
export function refreshUnlocks(state: GameState, now: number): void {
  if (!state.enzymesUnlocked && (ownedCount(state) >= ENZYMES_UNLOCK_TILES || (state.calendar && phaseAt(now).index >= 1))) {
    state.enzymesUnlocked = true;
  }
  if (!state.signalsUnlocked) {
    for (const t of ownedTiles(state)) {
      if (t.terrain === "roots" && t.growthEndsAt === null) {
        state.signalsUnlocked = true;
        break;
      }
    }
  }
}

/** Signals per second right now (connected Roots tiles), including the offline factor. */
export function signalRate(state: GameState, at: number = state.updatedAt): number {
  let roots = 0;
  for (const k of networkHops(state, at).keys()) if (state.tiles.get(k)!.terrain === "roots") roots++;
  return ((roots * SIGNALS.perRootsPerHour) / 3_600_000) * 1000 * offlineFactor(state, at);
}

/** Checks choosing a relic earned by looting a Ruine. */
export function checkChooseRelic(state: GameState, id: string): ActionResult {
  if (!(RELIC_IDS as readonly string[]).includes(id)) return { ok: false, error: "unknown_relic" };
  if (state.relicPicks <= 0) return { ok: false, error: "no_relic" };
  if (state.relics.includes(id as RelicId)) return { ok: false, error: "relic_owned" };
  return { ok: true };
}

export function chooseRelic(state: GameState, id: string): ActionResult {
  const check = checkChooseRelic(state, id);
  if (!check.ok) return check;
  state.relics.push(id as RelicId);
  state.relicPicks -= 1;
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
    const waiting = plan.queueWaiting || plan.autoInvest ? (Math.floor(t / TICK_MS) + 1) * TICK_MS : Infinity;
    const event = Math.min(plan.nextEvent, waiting);
    const next = Math.min(to, event);
    integrate(state, plan, next - t);
    t = next;
    if (next < event) break; // Reached `to` before the next event.

    let changed = false;
    if (plan.nextEvent <= t) {
      // M6 floor: a colony down to 7 tiles loses no more, withering included.
      let owned = ownedCount(state);
      for (const tile of ownedTiles(state)) {
        if (tile.growthEndsAt !== null && tile.growthEndsAt <= t) {
          tile.growthEndsAt = null;
          tile.growthStartedAt = null;
          changed = true;
          // M7: the first colonisation of a Ruine loots it: a relic to choose, and rubble is left.
          if (tile.terrain === "ruin") {
            tile.terrain = "rubble";
            state.relicPicks += 1;
          }
        }
        if (tile.disconnectedSince !== null && t - tile.disconnectedSince >= TRANSPORT.witherMs && owned > ANTI_FRUSTRATION.floorTiles) {
          owned--;
          tile.owner = null;
          tile.structure = null;
          tile.capture = null;
          tile.effects = [];
          tile.growthEndsAt = null;
          tile.growthStartedAt = null;
          tile.disconnectedSince = null;
          tile.level = 0;
          changed = true;
        }
      }
      changed = true; // The offline threshold also changes the window.
    }
    if (changed) refreshConnections(state, t);
    // While the queue only waits for the purse, nothing can start: skip the check (a speed-up only).
    const waitingForPurse =
      !changed && plan.queueCost !== null && (plan.queueCost.enzymes ? state.enzymes : state.nutrients) < plan.queueCost.amount;
    if (!waitingForPurse && startQueued(state, t)) changed = true;
    // Automatic upgrades happen on the 5 s grid only, so the result does not depend on how often
    // `advance` is called.
    if (plan.autoInvest && t % TICK_MS === 0 && autoInvest(state, t)) {
      changed = true;
      if (startQueued(state, t)) changed = true;
    }
    if (changed) {
      plan = planWindow(state, t);
      refreshUnlocks(state, t);
    }
    if (t >= to) break;
  }
  refreshUnlocks(state, to);
  state.updatedAt = to;
}

/**
 * Nutrients per ms of a group of tiles (all of the player's tiles not siphoned, or those one player
 * siphons), and the same weighted by the biomass multiplier of each tile's place (centre).
 */
interface Flow {
  perMs: number;
  weightedPerMs: number;
}

/** What stays constant until the next event: what the network produces, when the next event is. */
interface Window {
  /** Production of the tiles nobody siphons. */
  own: Flow;
  /** Production of siphoned tiles, by the player siphoning them (GDD §6.2). */
  siphoned: Map<string, Flow>;
  factor: number;
  nextEvent: number;
  /** Phase multiplier on biomass gains. */
  biomass: number;
  /** Enzymes per ms (before the offline factor). */
  enzymesPerMs: number;
  queueWaiting: boolean;
  /** Auto-reinvestment is on: check the upgrades on the 5 s grid. */
  autoInvest: boolean;
  /** What the queue's first tile costs while it waits for the purse (null: it may start or be dropped). */
  queueCost: { amount: number; enzymes: boolean } | null;
  /** Share of production put in the pact's pot (M7). */
  pactShare: number;
  /** Signals per ms (before the offline factor). */
  signalsPerMs: number;
}

/**
 * Per-tile `baseProduction` of one player, valid while what it depends on beyond the tile and its
 * neighbours stays the same: the day's effects, the Monday bonus, the upgrades, mutations and strain.
 */
interface ProductionCache {
  tiles: Map<string, Tile>;
  fx: PhaseEffects;
  monday: number;
  digestion: number;
  wood: number;
  mutations: string;
  strain: StrainId | null;
  entries: Map<Tile, { level: number; hops: number; around: number; toxic: boolean; value: number }>;
}
const productionCaches = new WeakMap<GameState, ProductionCache>();

/**
 * `baseProduction`, kept per tile until the tile, its neighbours, its level, its distance to the Cœur or
 * the player's context change (M9 speed-up: same numbers). Tiles with timed effects are always recomputed.
 */
function cachedBaseProduction(state: GameState, cache: ProductionCache, tile: Tile, hops: number, at: number): number {
  if (tile.effects.length > 0) return baseProduction(state, tile, hops, at);
  const around = neighbourhoodVersion(state.tiles, tile);
  if (around === null) return baseProduction(state, tile, hops, at);
  const e = cache.entries.get(tile);
  if (e !== undefined && e.level === tile.level && e.hops === hops && e.around === around && e.toxic === tile.toxic) return e.value;
  const value = baseProduction(state, tile, hops, at);
  cache.entries.set(tile, { level: tile.level, hops, around, toxic: tile.toxic, value });
  return value;
}

function productionCache(state: GameState, t: number): ProductionCache {
  const fx = effectsAt(state, t);
  const monday = state.mondayBonus > 0 && state.calendar && phaseAt(t).id === "germination" ? state.mondayBonus : 0;
  let cache = productionCaches.get(state);
  if (
    !cache ||
    cache.tiles !== state.tiles ||
    cache.fx !== fx ||
    cache.monday !== monday ||
    cache.digestion !== state.upgrades.digestion ||
    cache.wood !== state.upgrades.woodDecomposer ||
    cache.strain !== state.strain ||
    cache.mutations !== mutationKey(state)
  ) {
    cache = {
      tiles: state.tiles,
      fx,
      monday,
      digestion: state.upgrades.digestion,
      wood: state.upgrades.woodDecomposer,
      mutations: mutationKey(state),
      strain: state.strain,
      entries: new Map(),
    };
    productionCaches.set(state, cache);
  }
  return cache;
}

/** What the walk over a player's tiles found in `planWindow`, and what it depended on. */
interface TileWalk {
  version: number;
  hops: Map<string, number>;
  cache: ProductionCache;
  bonus: number;
  canWither: boolean;
  from: number;
  own: Flow;
  siphoned: Map<string, Flow>;
  enzymes: number;
  roots: number;
  /** The first change coming from the tiles themselves: a growth ending, a tile withering, an effect ending. */
  next: number;
  growing: boolean;
}
const tileWalks = new WeakMap<GameState, TileWalk>();

/**
 * Walks over the player's tiles for `planWindow`; the result is kept while nothing it read has changed
 * (M9 speed-up: `advance` starts with a new window every time it is called).
 */
function walkTiles(state: GameState, t: number, hops: Map<string, number>, bonus: number, cache: ProductionCache): TileWalk {
  const canWither = ownedCount(state) > ANTI_FRUSTRATION.floorTiles;
  const version = ownerVersion(state.tiles, state.id);
  const known = tileWalks.get(state);
  if (
    version !== null &&
    known !== undefined &&
    known.version === version &&
    known.hops === hops &&
    known.cache === cache &&
    known.bonus === bonus &&
    known.canWither === canWither &&
    t >= known.from &&
    t < known.next
  ) {
    return known;
  }
  const own: Flow = { perMs: 0, weightedPerMs: 0 };
  const siphoned = new Map<string, Flow>();
  let enzymes = 0;
  let roots = 0;
  let next = Infinity;
  let growing = false;
  for (const tile of ownedTiles(state)) {
    const d = hops.get(tileKey(state.tiles, tile));
    if (isGrown(state, tile) && d !== undefined) {
      const perMs = (cachedBaseProduction(state, cache, tile, d, t) * bonus) / 1000;
      const by = siphonedBy(tile, state.id, t);
      let flow = own;
      if (by !== null) {
        flow = siphoned.get(by) ?? { perMs: 0, weightedPerMs: 0 };
        siphoned.set(by, flow);
      }
      flow.perMs += perMs;
      flow.weightedPerMs += perMs * placeBiomass(state, tile);
      if (tile.structure === "gland") enzymes += glandRate(tile) / 1000;
      if (tile.terrain === "roots") roots++;
    }
    if (tile.growthEndsAt !== null) {
      growing = true;
      next = Math.min(next, tile.growthEndsAt);
    }
    if (tile.disconnectedSince !== null && canWither) next = Math.min(next, tile.disconnectedSince + TRANSPORT.witherMs);
    // Timed effects change production or the network when they end.
    for (const e of tile.effects) if (e.until > t) next = Math.min(next, e.until);
  }
  const walk: TileWalk = { version: version ?? -1, hops, cache, bonus, canWither, from: t, own, siphoned, enzymes, roots, next, growing };
  if (version !== null) tileWalks.set(state, walk);
  return walk;
}

function planWindow(state: GameState, t: number): Window {
  const hops = networkHops(state, t);
  const bonus = networkBonus(state, hops, t);
  const cache = productionCache(state, t);
  const walk = walkTiles(state, t, hops, bonus, cache);
  const { own, siphoned, enzymes, roots, growing } = walk;
  let next = walk.next;
  if (state.lastSeenAt !== null && state.lastSeenAt + OFFLINE.fullMs > t) {
    next = Math.min(next, state.lastSeenAt + OFFLINE.fullMs);
  }
  if (state.calendar) next = Math.min(next, nextPhaseChange(t));
  if (state.taintedUntil !== null && state.taintedUntil > t) next = Math.min(next, state.taintedUntil);
  return {
    own,
    siphoned,
    factor: offlineFactor(state, t),
    biomass: effectsAt(state, t).biomass,
    enzymesPerMs: enzymes,
    nextEvent: Math.max(next, t),
    // Auto-colonisation keeps the queue busy: it may plan a tile at any grid step.
    queueWaiting: (state.queue.length > 0 || (state.automation.colonize !== null && automationUnlocked(state).colonize)) && !growing,
    autoInvest: state.automation.upgrades && automationUnlocked(state).upgrades,
    queueCost: growing ? null : waitingCost(state, t),
    pactShare: state.pact !== null ? PACTS.share : 0,
    signalsPerMs: (roots * SIGNALS.perRootsPerHour) / 3_600_000,
  };
}

/** Cost of the queue's first tile if it is still valid, null otherwise (see `startQueued`). */
function waitingCost(state: GameState, t: number): { amount: number; enzymes: boolean } | null {
  const head = state.queue[0];
  const tile = head ? state.tiles.get(hexKey(head)) : undefined;
  if (
    !tile ||
    tile.owner !== null ||
    (tile.reservedFor !== null && tile.reservedFor !== state.id) ||
    !canColonizeTerrain(state, tile.terrain) ||
    !isAdjacentToNetwork(state, tile) ||
    (TERRAIN_STATS[tile.terrain].paidInEnzymes && !state.enzymesUnlocked)
  ) {
    return null;
  }
  return { amount: colonizationCost(state, tile, t), enzymes: TERRAIN_STATS[tile.terrain].paidInEnzymes === true };
}

/**
 * Accrues production over `dt` ms inside one window (M9: without wear, every tile produces at a steady
 * rate, so the window's totals are enough).
 */
function integrate(state: GameState, w: Window, dt: number): void {
  if (dt <= 0) return;
  const x = dt * w.factor;
  // The pact's pot (M7) takes its share of what the player keeps; the forest shares it between the members.
  const kept = 1 - w.pactShare;
  let produced = w.own.perMs * x;
  let weighted = w.own.weightedPerMs * x;
  for (const [by, flow] of w.siphoned) {
    const amount = flow.perMs * x;
    state.siphoned[by] = (state.siphoned[by] ?? 0) + amount * ACTION_EFFECTS.siphonShare;
    produced += amount * (1 - ACTION_EFFECTS.siphonShare);
    weighted += flow.weightedPerMs * x * (1 - ACTION_EFFECTS.siphonShare);
  }
  state.pactGiven += produced * w.pactShare;
  produced *= kept;
  weighted *= kept;
  state.nutrients += produced;
  state.enzymes += w.enzymesPerMs * dt * w.factor;
  state.signals += w.signalsPerMs * dt * w.factor;
  state.biomass += weighted * biomassConversion(state) * w.biomass;
}

/** Marks the player's tiles as connected or disconnected (disconnected ones start withering). */
export function refreshConnections(state: GameState, now: number): void {
  const hops = networkHops(state, now, true);
  for (const tile of ownedTiles(state)) {
    if (!isGrown(state, tile)) {
      tile.disconnectedSince = null;
      continue;
    }
    // Tiles only cut off by a Coupure stop producing but do not wither (GDD §6.2, M6 decision).
    if (hops.has(tileKey(state.tiles, tile))) tile.disconnectedSince = null;
    else tile.disconnectedSince ??= now;
  }
}

/** Starts queued colonisations while possible (planning one first with auto-colonisation). Returns true if one started. */
function startQueued(state: GameState, now: number): boolean {
  let started = false;
  if (state.queue.length === 0 && state.automation.colonize !== null && automationUnlocked(state).colonize && growingTiles(state).length === 0) {
    const target = autoColonizeTarget(state, now);
    if (target) state.queue.push({ q: target.q, r: target.r });
  }
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
    tile.level = 0;
    tile.growthStartedAt = now;
    tile.growthEndsAt = now + growthTimeMs(state, tile, now);
    tile.disconnectedSince = null;
    state.queue.shift();
    started = true;
  }
  return started;
}

/** Deep copy (tiles included), handy for client-side prediction and tests. */
export function cloneGame(state: GameState): GameState {
  const tiles = new Map<string, Tile>();
  for (const [k, t] of state.tiles) tiles.set(k, makeTile({ ...t, capture: t.capture && { ...t.capture }, effects: t.effects.map((e) => ({ ...e })) }));
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
    sporeUpgrades: { ...state.sporeUpgrades },
    automation: { ...state.automation },
    cooldowns: { ...state.cooldowns },
    siphoned: { ...state.siphoned },
    queue: state.queue.map((h) => ({ ...h })),
    allies: [...state.allies],
    relics: [...state.relics],
    listens: { ...state.listens },
    buds: state.buds.map((b) => ({ ...b })),
    tiles,
  };
}
