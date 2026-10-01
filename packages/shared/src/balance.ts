/**
 * Every tunable number of the game lives here (GDD §10: "formules de base, à équilibrer").
 * Values marked PLACEHOLDER are not in the GDD yet: they are starting points and are expected
 * to change during balancing. Values marked DECIDED were chosen by the owner.
 */

const HOUR = 3_600_000;

/**
 * The forest holds TILE_SCALE times more, smaller tiles than in M7 (×5 since the end of September 2026,
 * ×15 since M9, DECIDED). One old tile is worth TILE_SCALE new ones: per-tile yields and costs are divided
 * by it, the size factor of the colonisation cost is its TILE_SCALE-th root, and distances grow by
 * LENGTH_SCALE (≈ √TILE_SCALE), so the economy follows the same curve while the player buys TILE_SCALE
 * times more tiles per hour. With TILE_SCALE = 1, the M7 tile sizes. The unit tests pin it to 1
 * (`__TILE_SCALE__` in vitest.config.ts) because they check the rules on small maps; the simulations and
 * the game use the real value. A simulation can try another value with the `__TILE_SCALE__` global.
 */
declare const __TILE_SCALE__: number | undefined;
export const TILE_SCALE: number = typeof __TILE_SCALE__ === "number" ? __TILE_SCALE__ : 15;
/** Distances on the map grow by about √TILE_SCALE; spatial radii are multiplied by this. */
export const LENGTH_SCALE: number = Math.round(Math.sqrt(TILE_SCALE));
/** A per-tile amount of the M7 balance, divided among the TILE_SCALE smaller tiles. */
const perTile = (x: number) => x / TILE_SCALE;
/** A radius of the M7 balance, stretched to the larger map. */
const span = (r: number) => Math.round(r * LENGTH_SCALE);

/** Fog of war (GDD §2.1). Experiment: off, every player sees the whole forest. */
export const FOG_ENABLED = false;

export const TERRAINS = ["litter", "humus", "deadwood", "wetland", "stump", "roots", "rock", "carcass", "tree", "ruin", "rubble"] as const;
/**
 * GDD §2.2: Litière de feuilles, Humus, Bois mort (M1), Ruisseau / Zone humide (M2), in M5 Souche /
 * Tronc tombé, Racines d'arbre and Roche, in M6 the temporary Carcasse and the Arbre mourant (world boss)
 * left by events, and in M7 the Ruine, which turns into rubble once looted. The Sol acide was removed in
 * M9 with the wear.
 */
export type Terrain = (typeof TERRAINS)[number];
/** Terrains of the solo maps (M1–M2). */
export const LAND_TERRAINS = ["litter", "humus", "deadwood"] as const satisfies readonly Terrain[];
/** Forest land terrains, in the order the terrain motif assigns them (poorest to richest). */
export const FOREST_TERRAINS = ["litter", "humus", "deadwood", "stump"] as const satisfies readonly Terrain[];

export interface TerrainStats {
  /** Can be colonised. Wetlands need a mutation (GDD §2.2), which arrives in M5. */
  readonly colonizable: boolean;
  /** Nutrients per second produced by one colonised tile (GDD §2.2 "Rendement"). PLACEHOLDER. */
  readonly yieldPerSecond: number;
  /**
   * `base_terrain` of the colonisation cost formula (GDD §2.3). Tuned with the forest simulation
   * (`pnpm --filter @mycelium/shared simulate:forest`).
   */
  readonly baseCost: number;
  /** Hyphae growth time before the tile is colonised, in seconds (GDD §2.3: 30 s to a few minutes). PLACEHOLDER. */
  readonly growthSeconds: number;
  /** Nutrient reserve of a fresh tile, stored in `hex.reserve`. Unused by the rules. */
  readonly reserve: number;
  /** Colonisation is paid in Enzymes instead of nutrients (Roche, GDD §2.2): `baseCost` is then in Enzymes. */
  readonly paidInEnzymes?: boolean;
}

export const TERRAIN_STATS: Readonly<Record<Terrain, TerrainStats>> = {
  // GDD §2.2: low yield, very low cost — ideal to spread fast.
  litter: { colonizable: true, yieldPerSecond: perTile(0.5), baseCost: perTile(4_000), growthSeconds: perTile(30), reserve: 500 },
  // GDD §2.2: medium yield, low cost — the base terrain.
  humus: { colonizable: true, yieldPerSecond: perTile(1), baseCost: perTile(8_000), growthSeconds: perTile(60), reserve: 2_000 },
  // GDD §2.2: high yield, medium cost (it no longer wears out into Humus since M9).
  deadwood: { colonizable: true, yieldPerSecond: perTile(3), baseCost: perTile(20_000), growthSeconds: perTile(120), reserve: 5_000 },
  // GDD §2.2: cannot be colonised without a mutation (Hyphes aquatiques, M5); boosts humidity of adjacent
  // tiles. The yield, cost and times only apply to that mutation. PLACEHOLDER.
  wetland: { colonizable: false, yieldPerSecond: perTile(0.5), baseCost: perTile(7_200), growthSeconds: perTile(60), reserve: 0 },
  // GDD §2.2: very high yield, high cost — the contested "objective" tiles, near the centre. M5, PLACEHOLDER.
  stump: { colonizable: true, yieldPerSecond: perTile(4), baseCost: perTile(50_000), growthSeconds: perTile(240), reserve: 20_000 },
  // GDD §2.2: medium yield + bonus (mycorrhiza, see ROOTS). M5, PLACEHOLDER.
  roots: { colonizable: true, yieldPerSecond: perTile(1), baseCost: perTile(10_000), growthSeconds: perTile(90), reserve: 3_000 },
  // GDD §2.2: yields nothing, costs Enzymes; a rampart (see ROCK). M5, PLACEHOLDER.
  rock: { colonizable: true, yieldPerSecond: perTile(0), baseCost: perTile(40), growthSeconds: perTile(300), reserve: 0, paidInEnzymes: true },
  // GDD §2.2, M6 event: a huge burst for little cost, gone after 12 h. PLACEHOLDER.
  carcass: { colonizable: true, yieldPerSecond: perTile(12), baseCost: perTile(6_000), growthSeconds: perTile(60), reserve: 0 },
  // GDD §7, M6 world boss: the Arbre mourant stands on these tiles; nobody can colonise them.
  tree: { colonizable: false, yieldPerSecond: 0, baseCost: 0, growthSeconds: 0, reserve: 0 },
  // GDD §2.2, M7 DECIDED: one per slice in the middle ring, paid in Enzymes, yields nothing; the first
  // colonisation gives a relic (see RELICS). Numbers PLACEHOLDER.
  ruin: { colonizable: true, yieldPerSecond: 0, baseCost: 60, growthSeconds: 1_800, reserve: 0, paidInEnzymes: true },
  // A looted Ruine: yields nothing, cheap. PLACEHOLDER.
  rubble: { colonizable: true, yieldPerSecond: perTile(0), baseCost: perTile(2_000), growthSeconds: perTile(60), reserve: 0 },
};

/** Racines d'arbre (GDD §2.2 "mycorhize"): each colonised Roots tile adds this to the whole network's production. PLACEHOLDER. */
export const ROOTS = { networkBonus: perTile(0.03) } as const;
/** Roche (GDD §2.2 "rempart défensif"): captures of the owner's tiles next to their Rock run at this speed. PLACEHOLDER. */
export const ROCK = { rampartFactor: 0.5 } as const;

export const MAP = {
  /** Radius of the solo map: 3r(r+1)+1 = 331 hexes. PLACEHOLDER (final shape decided in M3, GDD §2.5). */
  radius: 10,
  /** Share of each land terrain among land tiles. PLACEHOLDER. */
  terrainWeights: { litter: 0.4, humus: 0.4, deadwood: 0.2 } as Readonly<Record<(typeof LAND_TERRAINS)[number], number>>,
  /** Share of the map covered by wetlands. PLACEHOLDER. */
  wetlandShare: 0.08,
  /** No wetland within this distance of the start tile. */
  wetlandFreeRadius: 2,
  /** Size, in hexes, of the terrain patches produced by the generator's noise. */
  patchSize: 2.5,
} as const;

export const ECONOMY = {
  /** Nutrients a new player starts with: enough for 2 or 3 tiles right away. Tuned. */
  startingNutrients: 10_000, // now about a dozen tiles at once
  /** `taux_conversion` of GDD §10: share of production also credited as Biomass. PLACEHOLDER. */
  biomassConversionRate: 0.1,
  /**
   * Colonisation cost: `base × (1 + distanceFactor × dist_cœur) × sizeFactor ^ nb_cases × zone` (GDD §2.3).
   * sizeFactor: 1.02 in the GDD, 1.13 in M5, 1.14 per M7 tile in M8 (forest full around day 4–5). M9,
   * DECIDED: the forest fills between day 6 and 7, with ≈ 1.036 per tile at the ×5 scale (≈ 1.19 per M7
   * tile, ≈ 1.012 per tile at ×15).
   */
  distanceFactor: 0.05 / Math.sqrt(TILE_SCALE),
  sizeFactor: 1.036 ** (5 / TILE_SCALE),
  /** Upgrade cost: `base × upgradeCostGrowth ^ level` (GDD §10). */
  upgradeCostGrowth: 1.15,
  /** How many colonisations may grow at the same time; the others wait in the queue. PLACEHOLDER. */
  maxConcurrentGrowths: 1,
} as const;

/** Nutrient transport to the Cœur (GDD §2.4). */
export const TRANSPORT = {
  /** `perte = 1 % par saut` (GDD §2.4). */
  lossPerHop: 0.01 / Math.sqrt(TILE_SCALE),
  /** Loss cap, so far tiles still produce a little. PLACEHOLDER. */
  maxLoss: 0.9,
  /** A disconnected tile stops producing, then withers and is lost after this delay. PLACEHOLDER. */
  witherMs: 1 * HOUR,
} as const;

export const HUMIDITY = {
  /** Production bonus of a tile next to at least one wetland (GDD §2.2). PLACEHOLDER. */
  wetlandBonus: 0.25,
} as const;

/** Offline production (GDD §9). */
export const OFFLINE = {
  /** Full production during the first hours of absence (GDD §9: 8 h). */
  fullMs: 8 * HOUR,
  /** Then production stays at this share until the player comes back. DECIDED. */
  reducedFactor: 0.25,
} as const;

/** Expansion queue (GDD §9): colonisations that start on their own, even while offline. DECIDED: 10. */
export const QUEUE_MAX = 10 * TILE_SCALE;

/** The Cœur can be moved once per day (GDD §2.4), implemented as a rolling 24 h cooldown. */
export const HEART_MOVE_COOLDOWN_MS = 24 * HOUR;

/** Server simulation tick (GDD §12: 1 tick every 5 s). Also the grid on which the queue retries. */
export const TICK_MS = 5_000;

export const UPGRADE_IDS = ["digestion", "hyphalGrowth", "thriftyExpansion", "biomassConversion", "woodDecomposer"] as const;
/** The five M1 upgrades (GDD §14). */
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface UpgradeStats {
  /** Cost of level 1; level n+1 costs `baseCost × 1.15^n`. Tuned with the forest simulation. */
  readonly baseCost: number;
  /** Effect per level, as a fraction (0.1 = 10 %), from the GDD §14 table. */
  readonly perLevel: number;
}

export const UPGRADE_STATS: Readonly<Record<UpgradeId, UpgradeStats>> = {
  /** Digestion accrue: +10 % yield on every tile per level (additive). */
  digestion: { baseCost: 7_500, perLevel: 0.1 },
  /** Croissance des hyphes: −8 % growth time per level (compounded: × 0.92^level). */
  hyphalGrowth: { baseCost: 12_000, perLevel: 0.08 },
  /** Expansion économe: −5 % colonisation cost per level (compounded: × 0.95^level). */
  thriftyExpansion: { baseCost: 15_000, perLevel: 0.05 },
  /** Conversion en biomasse: +10 % conversion rate per level (additive). */
  biomassConversion: { baseCost: 9_000, perLevel: 0.1 },
  /** Décomposeur de bois: +15 % Dead wood yield per level (additive). */
  woodDecomposer: { baseCost: 18_000, perLevel: 0.15 },
};

// ---------------------------------------------------------------------------
// M3 — shared forests (GDD §2.1, §2.5, §6)

export const FOREST = {
  /** Players per forest. DECIDED: 12 (the owner found 24 too crowded). */
  capacity: 12,
  /** Target number of hexes per player (GDD §2.1: 40 to 60); the map radius follows from it. */
  hexesPerPlayer: 50 * TILE_SCALE,
  /**
   * Spawns sit on the rim, at this share of the radius (GDD §2.5: "bord = zone sûre"): in the middle of
   * zone 1 since M9 (0.85 before). PLACEHOLDER.
   */
  spawnDistance: 0.93,
  /**
   * Rings of §2.5, as shares of the radius: centre below `centre`, rim above `rim`. Since M9 they only set
   * the terrain mix and the centre's risk (CENTRE_RISK, strong events); richness and difficulty follow the
   * 7 zones (ZONES). PLACEHOLDER.
   */
  ring: { centre: 1 / 3, rim: 2 / 3 },
  /**
   * Land terrain mix per ring (GDD §2.5: poor rim, rich centre). Rock and Roots are scattered by their
   * own motif; the other terrains follow the main motif in FOREST_TERRAINS order. PLACEHOLDER (the Sol
   * acide's share went to the other terrains in M9).
   */
  terrainWeights: {
    rim: { litter: 0.55, humus: 0.31, deadwood: 0.04, stump: 0, roots: 0.07, rock: 0.03 },
    middle: { litter: 0.3, humus: 0.33, deadwood: 0.16, stump: 0, roots: 0.08, rock: 0.06 },
    centre: { litter: 0.05, humus: 0.2, deadwood: 0.4, stump: 0.14, roots: 0.05, rock: 0.06 },
  } as Readonly<Record<"rim" | "middle" | "centre", Readonly<Record<(typeof FOREST_TERRAINS)[number] | "roots" | "rock", number>>>>,
  /** Share of wetlands. PLACEHOLDER. */
  wetlandShare: 0.06,
  /** No wetland within this distance of a spawn. */
  spawnClearRadius: span(2),
} as const;

/**
 * M9, DECIDED: the forest is cut into 7 rings of the same thickness, one per day of the season, from the
 * rim (zone 1) to the centre (zone 7). Each zone is richer and harder to take than the one outside it:
 * colonising costs more, hyphae grow longer and captures by a neighbour take longer. No lock: only the
 * economy decides, so that a colony reaches zone N around day N. Values by zone, from 1 to 7: PLACEHOLDER,
 * proposed after simulation.
 */
export const ZONES = {
  count: 7,
  /** Yield multiplier (replaces the rim ×1 / middle ×1.5 / centre ×3–5 of §2.5). */
  richness: [1, 1.25, 1.55, 1.95, 2.45, 3.1, 4],
  /** Colonisation cost multiplier (nutrients). */
  cost: [1, 1.6, 2.6, 4.2, 6.8, 11, 18],
  /** Hyphae growth time multiplier. */
  growth: [1, 1.15, 1.3, 1.5, 1.75, 2, 2.3],
  /** Capture time multiplier, for a neighbour taking the tile. */
  capture: [1, 1.15, 1.3, 1.5, 1.75, 2, 2.3],
} as const;

/** Players see the tiles within this distance of their network (GDD §2.1 fog). */
export const VISION_RADIUS = 1;

/** Border fights (GDD §6.1, §6.4). */
export const BORDERS = {
  /** Tiles counted around a contested tile for `densité_réseau_local`. */
  densityRadius: 2,
  /**
   * Time for a clearly stronger network (twice the pressure or more) to take a tile, by terrain.
   * DECIDED range 10 min – 2 h, by tile type; values PLACEHOLDER.
   */
  captureMs: {
    litter: (10 * 60_000) / LENGTH_SCALE,
    humus: (45 * 60_000) / LENGTH_SCALE,
    deadwood: (2 * HOUR) / LENGTH_SCALE,
    wetland: (45 * 60_000) / LENGTH_SCALE,
    stump: (2 * HOUR) / LENGTH_SCALE,
    roots: (45 * 60_000) / LENGTH_SCALE,
    rock: (2 * HOUR) / LENGTH_SCALE,
    carcass: (10 * 60_000) / LENGTH_SCALE,
    tree: (2 * HOUR) / LENGTH_SCALE,
    ruin: (45 * 60_000) / LENGTH_SCALE,
    rubble: (10 * 60_000) / LENGTH_SCALE,
  } as Readonly<Record<Terrain, number>>,
  /** Pressure ratio at which the capture runs at full speed; below 1 nothing happens. */
  fullSpeedRatio: 2,
  /** GDD §6.4: start zone protected for 24 h, within this distance of the spawn. */
  protectedMs: 24 * HOUR,
  protectedRadius: span(2),
  /** GDD §6.4: after 2 h of inactivity, captures on your tiles run at half speed. */
  shieldAfterMs: 2 * HOUR,
  shieldFactor: 0.5,
  /** Conquest bonus (GDD §2.5): biomass worth this long of the tile's fresh production. PLACEHOLDER. */
  conquestBonusMs: 1 * HOUR, // per-tile production is already smaller
} as const;

// ---------------------------------------------------------------------------
// M5 — structures and Enzymes (GDD §3, §4.1). DECIDED: the proposed package; numbers PLACEHOLDER.

export const STRUCTURE_IDS = ["node", "gland", "reservoir", "rhizomorph", "sclerotium", "carpophore"] as const;
/** Nœud de digestion, Glande enzymatique, Réservoir, Rhizomorphe, Sclérote, Carpophore (GDD §4.1). */
export type StructureId = (typeof STRUCTURE_IDS)[number];

export const STRUCTURES = {
  /** Nutrient cost of a structure: `baseCost × costGrowth ^ structures already owned`. */
  baseCost: { node: perTile(60_000), gland: perTile(45_000), reservoir: perTile(45_000), rhizomorph: perTile(36_000), sclerotium: perTile(90_000), carpophore: perTile(75_000) } as Readonly<
    Record<StructureId, number>
  >,
  costGrowth: 1.5 ** (1 / TILE_SCALE),
  /** Nœud de digestion: +50 % on its tile. */
  nodeBonus: 0.5,
  /** Glande enzymatique: its tile yields 50 % less, and it makes Enzymes (twice as many on Dead wood or a Stump). */
  glandPenalty: 0.5,
  glandEnzymesPerSecond: perTile(0.01),
  glandWoodFactor: 2,
  /** Rhizomorphe: captures of its tile run at this speed; crossing it costs no transport hop. */
  rhizomorphCaptureFactor: 0.5,
  /** Sclérote: one per player. */
  sclerotiumMax: 1,
  /** Carpophore: reveals the fog this far; it is seen by every player. */
  carpophoreVision: span(3),
  /** Carpophore: +25 % Spores per Carpophore when fruiting (step 3). */
  carpophoreSporeBonus: perTile(0.25),
} as const;

/** GDD §3: Enzymes appear once the player holds this many tiles, or from Tuesday on. */
export const ENZYMES_UNLOCK_TILES = 15 * TILE_SCALE;

// ---------------------------------------------------------------------------
// M5 — mutations and strains (GDD §4.2, §4.3). DECIDED: the proposed packages; numbers PLACEHOLDER.

export const MUTATION_BRANCHES = {
  /** Décomposeur (economy). */
  // M9, DECIDED: Usure lente and Acidophile (wear) replaced by Digestion profonde and Mycélium dense.
  decomposer: ["digestiveEnzymes", "deepDigestion", "saprophyte", "denseMycelium", "dormancy"],
  /** Parasite (aggression). M9: the last one, Cordyceps, is renamed Parasitisme (same effect). */
  parasite: ["aggressiveHyphae", "plunder", "toxins", "temerity", "parasitism"],
  /** Symbiote (support). */
  symbiote: ["mycorrhiza", "mycelialCords", "resilience", "bioluminescence", "aquaticHyphae"],
} as const;
export type MutationBranch = keyof typeof MUTATION_BRANCHES;
export const MUTATION_IDS = Object.values(MUTATION_BRANCHES).flat() as MutationId[];
export type MutationId = (typeof MUTATION_BRANCHES)[MutationBranch][number];

export const MUTATIONS = {
  /** One mutation point each time the season's biomass passes `firstThreshold × thresholdGrowth ^ k`. */
  firstThreshold: 20_000,
  thresholdGrowth: 3,
  /** Enzymes digestives: production +15 %. */
  digestiveEnzymes: 0.15,
  /** Digestion profonde (M9): Enrichissement 15 % cheaper. */
  deepDigestion: 0.15,
  /** Mycélium dense (M9): Cohésion +7.5 % production per neighbour instead of +5 % (so up to +45 %). */
  denseMycelium: 0.075,
  /** Saprophyte: Dead wood and Stumps +50 %. */
  saprophyte: 0.5,
  /** Dormance: offline production ×1.5, online ×0.8. */
  dormancyOffline: 1.5,
  dormancyOnline: 0.8,
  /** Hyphes agressives: border pressure +40 % (+25 % until M8, raised to answer the cohesion defence). */
  aggressiveHyphae: 0.4,
  /** Pillage: conquest bonus ×2. */
  plunder: 2,
  /** Toxines: enemy tiles touching yours produce 15 % less. */
  toxins: 0.15,
  /** Témérité: +3 % production per tile of yours on an enemy border, up to +40 %. */
  temerityPerTile: 0.03 / LENGTH_SCALE,
  temerityMax: 0.4, // M8: +40 % at most (30 % before), to answer the cohesion defence.
  /** Mycorhize: Roots ×4 (yield and network bonus). */
  mycorrhiza: 4,
  /** Cordons mycéliens: no transport loss. */
  mycelialCords: 0,
  /** Résilience: captures of your tiles −15 % (−25 % until M8: it now adds to the cohesion defence). */
  resilience: 0.85,
  /** Bioluminescence: enemy networks seen this far. */
  bioluminescenceVision: span(3),
} as const;

export const STRAIN_IDS = ["cordyceps", "armillaria"] as const;
/**
 * M9, DECIDED: two strains, for everyone (GDD §4.3): Cordyceps (offensive) and Armillaire (defensive).
 * Pleurote, Truffe and Moisissure were removed.
 */
export type StrainId = (typeof STRAIN_IDS)[number];

export const STRAINS = {
  /**
   * Cordyceps (offensive), DECIDED: pressure +20 %, conquest bonus +50 %, its captures 15 % faster,
   * production −10 %. Numbers to balance.
   */
  cordyceps: { pressure: 1.2, conquestBonus: 1.5, captureSpeed: 1.15, production: 0.9 },
  /**
   * Armillaire (defensive), DECIDED: captures of its tiles take 30 % longer, the pressure it suffers −15 %,
   * its own pressure −10 %, production ×0.95 on Monday, +0.05 each day, ×1.25 on Sunday (×1 outside the
   * calendar). Numbers to balance.
   */
  armillaria: { monday: 0.95, perDay: 0.05, capturedTime: 1.3, pressureTaken: 0.85, pressure: 0.9 },
} as const;

// ---------------------------------------------------------------------------
// M5 — fruiting, Spores and automations (GDD §5, §9). DECIDED: the proposed package; numbers PLACEHOLDER.

export const FRUITING = {
  /** The player keeps the tiles within this distance of the Cœur at least. */
  minRadius: span(2),
  /** `spores = floor((value of the lost tiles / valueDivisor) ^ exponent)` (GDD §5). */
  valueDivisor: 1e4,
  exponent: 0.6,
  /** M8: the nutrients spent enriching the tiles given up count this many times in the value. */
  enrichWeight: 3,
} as const;

export const SPORE_UPGRADE_IDS = ["production", "growth", "conversion", "mutationPoint"] as const;
/** The Spore shop: bonuses for the rest of the week (GDD §5). */
export type SporeUpgradeId = (typeof SPORE_UPGRADE_IDS)[number];

export const SPORE_UPGRADES: Readonly<Record<SporeUpgradeId, { baseCost: number; perLevel: number }>> = {
  /** Production +25 % per level (additive; +10 % until M8, raised so that fruiting still pays once tiles are enriched). */
  production: { baseCost: 10, perLevel: 0.25 },
  /** Growth time −10 % per level (compounded). */
  growth: { baseCost: 10, perLevel: 0.1 },
  /** Biomass conversion +5 % per level (additive). */
  conversion: { baseCost: 15, perLevel: 0.05 },
  /** One more mutation point per level. */
  mutationPoint: { baseCost: 25, perLevel: 1 },
};
/** Spore shop prices: `baseCost × costGrowth ^ level`. */
export const SPORE_COST_GROWTH = 1.5;

/** Automations (GDD §9), unlocked by the season's biomass. */
export const AUTOMATION = {
  /** Auto-colonisation: when the queue is empty, plan the cheapest wild tile next to the network (preferred terrain first). */
  colonizeAt: 100_000,
  /** Auto-reinvestment: buy the cheapest upgrade with the nutrients the next colonisation does not need. */
  upgradesAt: 1_000_000,
} as const;

// ---------------------------------------------------------------------------
// M6 — conflict: active actions, anti-frustration, centre risk (GDD §2.5, §6.2, §6.4).
// DECIDED: the proposed package (biomass ×1.5 in the centre, floor of 7 tiles); numbers PLACEHOLDER.

export const ACTION_IDS = ["assault", "toxin", "cut", "siphon"] as const;
/** Assaut, Toxine, Coupure, Siphon (GDD §6.2): paid in Enzymes, on an enemy tile touching the network. */
export type ActionId = (typeof ACTION_IDS)[number];

export const ACTIONS: Readonly<Record<ActionId, { cost: number; cooldownMs: number; durationMs: number }>> = {
  /** Assaut: the tile is taken 4× faster, and as soon as the attacker is above parity. */
  assault: { cost: 30, cooldownMs: 4 * HOUR, durationMs: 30 * 60_000 },
  /** Toxine: the tile and its neighbours of the same owner produce 50 % less. */
  toxin: { cost: 20, cooldownMs: 3 * HOUR, durationMs: 1 * HOUR },
  /** Coupure: the tile carries no nutrients; tiles cut off behind it do not wither meanwhile. */
  cut: { cost: 40, cooldownMs: 6 * HOUR, durationMs: 45 * 60_000 },
  /** Siphon: 20 % of the production of the tile and of the owner's tiles within 2 goes to the caster. */
  siphon: { cost: 25, cooldownMs: 4 * HOUR, durationMs: 2 * HOUR },
};

export const ACTION_EFFECTS = {
  assaultSpeed: 4,
  toxinProduction: 0.5,
  siphonShare: 0.2,
  siphonRadius: span(2),
} as const;

export const ANTI_FRUSTRATION = {
  /** The Cœur is taken this much slower than a normal tile of its terrain. */
  heartCaptureFactor: 0.25,
  /** After losing it, the Cœur cannot be taken again for this long ("une fois par jour"). */
  heartShieldMs: 24 * HOUR,
  /** Against a player with this many times fewer tiles: captures slower and actions dearer (GDD §6.4). */
  bullyRatio: 3,
  bullyCaptureFactor: 0.25,
  bullyActionCost: 3,
  /** A player with this many tiles or fewer cannot lose any more. DECIDED: 7. */
  floorTiles: 7 * TILE_SCALE,
} as const;

export const CENTRE_RISK = {
  /** Offline shield in the centre: captures at this speed instead of BORDERS.shieldFactor (GDD §2.5). */
  shieldFactor: 0.75,
  /** Coupures on a centre tile cost this share. */
  cutCost: 0.5,
  /** Biomass of the production of centre tiles. DECIDED: ×1.5. */
  biomass: 1.5,
} as const;

// ---------------------------------------------------------------------------
// M6 — random events and the world boss (GDD §7). DECIDED: the proposed package; numbers PLACEHOLDER.

export const EVENT_KINDS = ["storm", "fire", "boar", "treefall", "carcass", "nematodes", "tree"] as const;
/** Orage, Incendie, Sanglier, Chute d'arbre, Carcasse, Nématodes, and the Arbre mourant (world boss). */
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENTS = {
  /** Every event is shown on the map this long before it starts. */
  announceMs: 1 * HOUR,
  /** Random events per day, Tuesday to Sunday (Monday is Germination, no events). */
  perDay: { min: 1, max: 3 },
  /** Random events start between these local hours. */
  hours: { from: 8, to: 20 },
  /** Draw weights of the random events; the Orage is more likely on Tuesday (Printemps). */
  weights: { storm: 3, fire: 2, boar: 2, carcass: 2, nematodes: 2 } as Readonly<Partial<Record<EventKind, number>>>,
  springStormWeight: 6,
  /** Events centred in the forest centre are stronger (GDD §2.5). */
  centreStrength: 1.5,
  /** An event takes at most this share of a player's tiles (rounded down), never the Cœur nor a Sclérote. */
  maxLossShare: 0.1,
} as const;

/** Orage: humidity boost in a zone. */
export const STORM = { radius: span(3), durationMs: 4 * HOUR, bonus: 0.5 } as const;
/** Incendie: the zone is burnt and released, then its Cendres produce more. */
export const FIRE = { radius: span(2), ashesMs: 24 * HOUR, ashesFactor: 2 } as const;
/** Sanglier: tears a line of tiles off (and turns the soil: fresh tiles). */
export const BOAR = { minLength: span(3), maxLength: span(6) } as const;
/**
 * Chute d'arbre, on Thursday (GDD §7 "Chute"): new Stumps at this local hour. M9, DECIDED: in the zone of
 * the day (zone 4 on Thursday), at the same places for every group of `copiesEvery` slices (DayPlace).
 * `minStumps`…`maxStumps` in all, shared between the copies.
 */
export const TREEFALL = { minStumps: 2 * TILE_SCALE, maxStumps: 3 * TILE_SCALE, hour: 10 } as const;
/**
 * M9, DECIDED: the events "of the centre" (Chute d'arbres, Arbre mourant) fall in the zone of the day
 * (zone N on day N), in several copies placed the same way for every group of `copiesEvery` slices, so that
 * no player is closer to them than another (proposal: groups of 3 slices, so 4 copies in a forest of 12).
 */
export const DAY_PLACE = { copiesEvery: 3 } as const;
/** Carcasse: a temporary very rich tile. */
export const CARCASS = { durationMs: 12 * HOUR } as const;
/**
 * Nématodes (PvE): they eat one tile of the zone every `biteMs`; the players whose tiles stand in
 * the zone digest them with their production. Killing them pays `rewardFactor` × the damage dealt, as
 * biomass. Their life: `hpHours` of the production of the zone's tiles, `minHp` at least.
 */
export const NEMATODES = { radius: span(2), durationMs: 6 * HOUR, biteMs: (30 * 60_000) / TILE_SCALE, hpHours: 1.5, minHp: 50_000, rewardFactor: 0.5 } as const;
/**
 * Arbre mourant (world boss), Thursday and Sunday at 14:00: 7 tiles in the zone of the day (M9: one tree per
 * group of slices, see DAY_PLACE; one life shared by all its copies). Players touching it digest it with
 * their whole production; its life is `hpHours` of the forest's production. At the end (dead, or after
 * 6 h), each contributor gets `biomassFactor` × their damage as biomass and a share of the Enzymes; the top
 * contributor a Trophy. The tree then leaves Stumps.
 */
export const DYING_TREE = { days: [3, 6], hour: 14, durationMs: 6 * HOUR, hpHours: 2, minHp: 200_000, biomassFactor: 0.25, enzymes: 300 } as const;

// ---------------------------------------------------------------------------
// M7 — social: pacts, chemical Signals, Ruins (GDD §3, §6.3). DECIDED: the proposed package; numbers PLACEHOLDER.

/** Pactes de symbiose (GDD §6.3). */
export const PACTS = {
  /** A pact holds 2 to 4 colonies; one pact per player. */
  maxMembers: 4,
  /** Each member puts this share of their production into a pot shared equally. */
  share: 0.05,
  /** Leaving with notice: the player stays in the pact this long, then leaves without penalty. */
  leaveNoticeMs: 1 * HOUR,
  /** Leaving at once is a betrayal: "Réseau tâché" for this long. */
  taintMs: 24 * HOUR,
  /** Production of a tainted network: −15 %. */
  taintProduction: 0.15,
  /** An invitation is valid this long. */
  inviteMs: 24 * HOUR,
} as const;

/** Signaux chimiques (GDD §3): made by Roots tiles, spent on sending resources and listening. */
export const SIGNALS = {
  /** Signals per hour per connected Roots tile. */
  perRootsPerHour: perTile(1),
  /** Sending Nutrients or Enzymes to an ally costs one Signal and loses 5 % on the way. */
  sendCost: 1,
  sendLoss: 0.05,
  /** Listening: another colony's whole network, through the fog, for an hour. */
  listenCost: 3,
  listenMs: 1 * HOUR,
} as const;

/** Relics (M7): the first colonisation of a Ruine gives one, for the week, chosen by the player. */
export const RELIC_IDS = ["vigour", "haste", "insight"] as const;
export type RelicId = (typeof RELIC_IDS)[number];
export const RELICS = {
  /** Production +10 %. */
  vigour: 0.1,
  /** Growth time −15 %. */
  haste: 0.15,
  /** One more mutation point. */
  insight: 1,
} as const;

/** Where the Ruine of each slice lies: in the middle ring, at this share of the radius, off the spawn axis. */
export const RUIN_PLACE = { distance: 0.5, p: 0.25 } as const;

// ---------------------------------------------------------------------------
// M8 — incremental: tile enrichment, buds, cohesion (GDD §2.3, §4.4). DECIDED: the proposed package;
// numbers PLACEHOLDER.

/**
 * Enrichissement: each owned tile has a level, bought at once with nutrients. Level n → n+1 costs
 * `base_case × costGrowth ^ n`, with `base_case` = `baseShare` of the tile's base price at the colony's
 * size (`baseCost × sizeFactor ^ nb_cases`, like colonising it without the distance), so a level stays a
 * fraction of a new tile and pays back about as well: many small purchases instead of a runaway (tuned
 * with the forest simulation). Each level gives +`perLevel` production to the tile, and every milestone
 * doubles it.
 */
export const ENRICH = {
  baseShare: 0.15,
  costGrowth: 1.12,
  perLevel: 0.08,
  /** Levels that double the tile's production; after the last one, every `milestoneEvery` more levels. */
  milestones: [10, 25, 50, 100] as readonly number[],
  milestoneEvery: 100,
  /** "×10" buys this many levels; "Max" at most this many in one go. */
  batch: 10,
  maxBatch: 1000,
  /** A captured tile keeps this share of its levels (rounded down). */
  capturedKeep: 0.5,
  /** Auto-reinvestment enriches at most one tile per this many ms (GDD §4.4: one per minute). */
  autoEveryMs: 60_000,
} as const;

/**
 * Bourgeons: every 2 to 4 minutes a bud grows on a random tile of the network; clicking it gives
 * `rewardSeconds` of the player's production; it fades after `lifeMs`. DECIDED intent: about 10 % of the
 * production at most, so the reward is 18 s (60 s every 3 min on average would be a third).
 */
export const BUDS = {
  minEveryMs: 2 * 60_000,
  maxEveryMs: 4 * 60_000,
  lifeMs: 5 * 60_000,
  rewardSeconds: 18,
  /** Buds waiting at the same time, at most. */
  max: 3,
} as const;

/**
 * Cohésion: each owned tile counts its grown neighbours of the same colony (0 to 6). Production
 * +`production` per neighbour; in defence, the attacker's pressure −`pressure` and the capture time
 * +`captureTime` per neighbour. A Rosace (all 6 neighbours) cannot be cut and its enrichment bonus
 * counts +`rosetteEnrich`.
 */
export const COHESION = {
  production: 0.05,
  pressure: 0.08,
  captureTime: 0.15,
  rosetteEnrich: 0.1,
} as const;
