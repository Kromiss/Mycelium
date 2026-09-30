import {
  ACTION_EFFECTS,
  ANTI_FRUSTRATION,
  AUTOMATION,
  CENTRE_RISK,
  ECONOMY,
  FRUITING,
  ENZYMES_UNLOCK_TILES,
  EXHAUSTION,
  HEART_MOVE_COOLDOWN_MS,
  ACID,
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
  type ActionId,
  type MutationId,
  type RelicId,
  type SporeUpgradeId,
  type StrainId,
  type StructureId,
  type Terrain,
  type UpgradeId,
} from "./balance";
import { lifetimeFactorAt, richnessAt, ringAt, type MapLayout } from "./forestgen";
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
  /** Timed effects on the tile: active actions (GDD §6.2) and, later, events. Expired ones are pruned by the forest. */
  effects: TileEffect[];
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
  | "relic_owned";

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
    effects: [],
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
  const hops = new Map<string, number>();
  const heart = state.tiles.get(hexKey(state.heart));
  if (!heart || !isGrown(state, heart)) return hops;
  const cut = (t: Tile) => !ignoreCuts && t.effects.length > 0 && activeEffect(t, "cut", at) !== undefined;
  if (cut(heart)) return hops;
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
      if (!t || !isGrown(state, t) || cut(t)) continue;
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

/** Hyphae growth time multiplier at `at`: the day's phase, the strain (Pleurote) and the Spore shop. */
export function growthTimeFactor(state: GameState, at: number): number {
  const strain = state.strain === "pleurotus" ? STRAINS.pleurotus.growthTime : 1;
  const spores = Math.pow(1 - SPORE_UPGRADES.growth.perLevel, state.sporeUpgrades.growth);
  const relic = state.relics.includes("haste") ? 1 - RELICS.haste : 1;
  return effectsAt(state, at).growthTime * strain * spores * relic;
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
  let border = 0;
  for (const t of state.tiles.values()) {
    if (t.owner !== state.id || t.growthEndsAt !== null) continue;
    if (hexNeighbors(t).some((n) => {
      const o = state.tiles.get(hexKey(n))?.owner;
      return o !== undefined && o !== null && o !== state.id && !state.allies.includes(o);
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
  const siphon = siphonedBy(tile, state.id, at) !== null ? 1 - ACTION_EFFECTS.siphonShare : 1;
  return baseProduction(state, tile, d, at) * bonus * (1 - Math.min(tile.exhaustion, wearCap(state))) * siphon;
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
    (tile.effects.length > 0 ? effectProduction(tile, at) : 1)
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
  const lost = [...state.tiles.values()].filter((t) => t.owner === state.id && hexDistance(state.heart, t) > radius);
  let value = 0;
  for (const t of lost) if (!TERRAIN_STATS[t.terrain].paidInEnzymes) value += colonizationCost(state, t, at);
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
  const seen = new Set<string>();
  for (const t of state.tiles.values()) {
    if (t.owner !== state.id || t.growthEndsAt !== null) continue;
    for (const n of hexNeighbors(t)) {
      const k = hexKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      const c = state.tiles.get(k);
      if (!c || c.owner !== null || (c.reservedFor !== null && c.reservedFor !== state.id)) continue;
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
    for (const t of state.tiles.values()) {
      if (t.owner === state.id && t.terrain === "roots" && t.growthEndsAt === null) {
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
      for (const tile of state.tiles.values()) {
        if (tile.owner !== state.id) continue;
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
        if (tile.terrain === "deadwood" && tile.exhaustion >= EXHAUSTION.max - 1e-9) {
          // GDD §2.2: exhausted Dead wood becomes (fresh) Humus.
          tile.terrain = "humus";
          tile.exhaustion = 0;
          changed = true;
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

interface Producer {
  tile: Tile;
  /** Nutrients per ms of the tile when fresh, after humidity and transport. */
  basePerMs: number;
  lifetime: number;
  /** Biomass multiplier of the tile's place (centre). */
  biomassWeight: number;
  /** Player siphoning the tile (GDD §6.2), null if none. */
  siphonBy: string | null;
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
  /** Auto-reinvestment is on: check the upgrades on the 5 s grid. */
  autoInvest: boolean;
  /** What the queue's first tile costs while it waits for the purse (null: it may start or be dropped). */
  queueCost: { amount: number; enzymes: boolean } | null;
  /** Share of production put in the pact's pot (M7). */
  pactShare: number;
  /** Signals per ms (before the offline factor). */
  signalsPerMs: number;
}

function planWindow(state: GameState, t: number): Window {
  const hops = networkHops(state, t);
  const bonus = networkBonus(state, hops, t);
  const producers: Producer[] = [];
  let enzymes = 0;
  let roots = 0;
  let next = Infinity;
  let growing = false;
  const canWither = ownedCount(state) > ANTI_FRUSTRATION.floorTiles;
  for (const tile of state.tiles.values()) {
    if (tile.owner !== state.id) continue;
    const lifetime = lifetimeMs(state, tile);
    const d = hops.get(hexKey(tile));
    if (isGrown(state, tile) && d !== undefined) {
      producers.push({
        tile,
        basePerMs: (baseProduction(state, tile, d, t) * bonus) / 1000,
        lifetime,
        biomassWeight: placeBiomass(state, tile),
        siphonBy: siphonedBy(tile, state.id, t),
      });
      if (tile.structure === "gland") enzymes += glandRate(tile) / 1000;
      if (tile.terrain === "roots") roots++;
      // Rounded up to a whole ms so every event time stays an integer (it is stored as a timestamp).
      if (tile.terrain === "deadwood") {
        next = Math.min(next, t + Math.ceil((Math.max(0, EXHAUSTION.max - tile.exhaustion) * lifetime) / EXHAUSTION.max));
      }
    }
    if (tile.growthEndsAt !== null) {
      growing = true;
      next = Math.min(next, tile.growthEndsAt);
    }
    if (tile.disconnectedSince !== null && canWither) next = Math.min(next, tile.disconnectedSince + TRANSPORT.witherMs);
    // Timed effects change production or the network when they end.
    for (const e of tile.effects) if (e.until > t) next = Math.min(next, e.until);
  }
  if (state.lastSeenAt !== null && state.lastSeenAt + OFFLINE.fullMs > t) {
    next = Math.min(next, state.lastSeenAt + OFFLINE.fullMs);
  }
  if (state.calendar) next = Math.min(next, nextPhaseChange(t));
  if (state.taintedUntil !== null && state.taintedUntil > t) next = Math.min(next, state.taintedUntil);
  return {
    producers,
    factor: offlineFactor(state, t),
    biomass: effectsAt(state, t).biomass,
    enzymesPerMs: enzymes,
    wearCap: wearCap(state),
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

/** Accrues production and updates exhaustion over `dt` ms inside one window. */
function integrate(state: GameState, w: Window, dt: number): void {
  if (dt <= 0) return;
  let produced = 0;
  let weighted = 0;
  for (const p of w.producers) {
    // ∫ (1 − min(e(τ), cap)) dτ with e rising at max/lifetime per ms up to EXHAUSTION.max; the player's
    // cap (Usure lente) may stop it from counting earlier.
    const rate = EXHAUSTION.max / p.lifetime;
    const e0 = p.tile.exhaustion;
    const cap = w.wearCap;
    const start = Math.min(e0, cap);
    const rising = e0 >= cap ? 0 : Math.min(dt, (cap - e0) / rate);
    const freshMs = rising * (1 - start) - (rate * rising * rising) / 2 + (dt - rising) * (1 - Math.min(cap, e0 + rate * dt));
    let amount = p.basePerMs * freshMs * w.factor;
    if (p.siphonBy !== null) {
      const taken = amount * ACTION_EFFECTS.siphonShare;
      state.siphoned[p.siphonBy] = (state.siphoned[p.siphonBy] ?? 0) + taken;
      amount -= taken;
    }
    if (w.pactShare > 0) {
      // M7: the pact's pot, shared by the forest between the members.
      const given = amount * w.pactShare;
      state.pactGiven += given;
      amount -= given;
    }
    produced += amount;
    weighted += amount * p.biomassWeight;
    p.tile.exhaustion = Math.min(EXHAUSTION.max, e0 + dt * rate);
  }
  state.nutrients += produced;
  state.enzymes += w.enzymesPerMs * dt * w.factor;
  state.signals += w.signalsPerMs * dt * w.factor;
  state.biomass += weighted * biomassConversion(state) * w.biomass;
}

/** Marks the player's tiles as connected or disconnected (disconnected ones start withering). */
export function refreshConnections(state: GameState, now: number): void {
  const hops = networkHops(state, now, true);
  for (const tile of state.tiles.values()) {
    if (tile.owner !== state.id) continue;
    if (!isGrown(state, tile)) {
      tile.disconnectedSince = null;
      continue;
    }
    // Tiles only cut off by a Coupure stop producing but do not wither (GDD §6.2, M6 decision).
    if (hops.has(hexKey(tile))) tile.disconnectedSince = null;
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
    tile.growthStartedAt = now;
    tile.growthEndsAt = now + growthDurationMs(tile.terrain, state.upgrades, growthTimeFactor(state, now));
    tile.disconnectedSince = null;
    state.queue.shift();
    started = true;
  }
  return started;
}

/** Deep copy (tiles included), handy for client-side prediction and tests. */
export function cloneGame(state: GameState): GameState {
  const tiles = new Map<string, Tile>();
  for (const [k, t] of state.tiles) tiles.set(k, { ...t, capture: t.capture && { ...t.capture }, effects: t.effects.map((e) => ({ ...e })) });
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
    tiles,
  };
}
