/**
 * Every tunable number of the game lives here (GDD §10: "formules de base, à équilibrer").
 * Values marked PLACEHOLDER are not in the GDD yet: they are starting points and are expected
 * to change during balancing. Values marked DECIDED were chosen by the owner.
 */

const HOUR = 3_600_000;

export const TERRAINS = ["litter", "humus", "deadwood", "wetland", "stump", "roots", "rock", "acid"] as const;
/**
 * GDD §2.2: Litière de feuilles, Humus, Bois mort (M1), Ruisseau / Zone humide (M2), and in M5 Souche /
 * Tronc tombé, Racines d'arbre, Roche and Sol acide. Carcasse and Ruine arrive with events (M6).
 */
export type Terrain = (typeof TERRAINS)[number];
/** Terrains of the solo maps (M1–M2). */
export const LAND_TERRAINS = ["litter", "humus", "deadwood"] as const satisfies readonly Terrain[];
/** Forest land terrains, in the order the terrain motif assigns them (poorest to richest). */
export const FOREST_TERRAINS = ["litter", "humus", "acid", "deadwood", "stump"] as const satisfies readonly Terrain[];

export interface TerrainStats {
  /** Can be colonised. Wetlands need a mutation (GDD §2.2), which arrives in M5. */
  readonly colonizable: boolean;
  /** Nutrients per second produced by one colonised tile (GDD §2.2 "Rendement"). PLACEHOLDER. */
  readonly yieldPerSecond: number;
  /**
   * `base_terrain` of the colonisation cost formula (GDD §2.3). Tuned with the forest simulation
   * (`pnpm --filter @mycelium/shared simulate:forest`) so that a forest of 12 fills up around day 4–5.
   */
  readonly baseCost: number;
  /** Hyphae growth time before the tile is colonised, in seconds (GDD §2.3: 30 s to a few minutes). PLACEHOLDER. */
  readonly growthSeconds: number;
  /** Occupied time after which the tile's wear reaches its cap (EXHAUSTION.max), in ms. DECIDED. */
  readonly lifetimeMs: number;
  /** Nutrient reserve of a fresh tile, stored in `hex.reserve`. Unused by the rules (exhaustion is time-based). */
  readonly reserve: number;
  /** Colonisation is paid in Enzymes instead of nutrients (Roche, GDD §2.2): `baseCost` is then in Enzymes. */
  readonly paidInEnzymes?: boolean;
}

export const TERRAIN_STATS: Readonly<Record<Terrain, TerrainStats>> = {
  // GDD §2.2: low yield, very low cost — ideal to spread fast.
  litter: { colonizable: true, yieldPerSecond: 0.5, baseCost: 3_600, growthSeconds: 30, lifetimeMs: 2 * HOUR, reserve: 500 },
  // GDD §2.2: medium yield, low cost — the base terrain.
  humus: { colonizable: true, yieldPerSecond: 1, baseCost: 7_200, growthSeconds: 60, lifetimeMs: 8 * HOUR, reserve: 2_000 },
  // GDD §2.2: high yield, medium cost; exhausts, then becomes Humus.
  deadwood: { colonizable: true, yieldPerSecond: 3, baseCost: 18_000, growthSeconds: 120, lifetimeMs: 4 * HOUR, reserve: 5_000 },
  // GDD §2.2: cannot be colonised without a mutation; boosts humidity of adjacent tiles.
  wetland: { colonizable: false, yieldPerSecond: 0, baseCost: 0, growthSeconds: 0, lifetimeMs: 0, reserve: 0 },
  // GDD §2.2: very high yield, high cost — the contested "objective" tiles, near the centre. M5, PLACEHOLDER.
  stump: { colonizable: true, yieldPerSecond: 4, baseCost: 45_000, growthSeconds: 240, lifetimeMs: 12 * HOUR, reserve: 20_000 },
  // GDD §2.2: medium yield + bonus (mycorrhiza, see ROOTS). M5, PLACEHOLDER.
  roots: { colonizable: true, yieldPerSecond: 1, baseCost: 9_000, growthSeconds: 90, lifetimeMs: 12 * HOUR, reserve: 3_000 },
  // GDD §2.2: yields nothing, costs Enzymes; a rampart (see ROCK). M5, PLACEHOLDER.
  rock: { colonizable: true, yieldPerSecond: 0, baseCost: 40, growthSeconds: 300, lifetimeMs: Infinity, reserve: 0, paidInEnzymes: true },
  // GDD §2.2: high yield, medium cost, but eats the network: wears twice as fast (see ACID). M5, PLACEHOLDER.
  acid: { colonizable: true, yieldPerSecond: 2, baseCost: 12_000, growthSeconds: 90, lifetimeMs: 2 * HOUR, reserve: 4_000 },
};

/** Racines d'arbre (GDD §2.2 "mycorhize"): each colonised Roots tile adds this to the whole network's production. PLACEHOLDER. */
export const ROOTS = { networkBonus: 0.02 } as const;
/** Roche (GDD §2.2 "rempart défensif"): captures of the owner's tiles next to their Rock run at this speed. PLACEHOLDER. */
export const ROCK = { rampartFactor: 0.5 } as const;
/** Sol acide: `lifetimeMs` above is already the fast wear (twice as fast as Humus would be over 4 h). */
export const ACID = { acidophileLifetimeFactor: 2 } as const;

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
  startingNutrients: 10_000,
  /** `taux_conversion` of GDD §10: share of production also credited as Biomass. PLACEHOLDER. */
  biomassConversionRate: 0.1,
  /**
   * Colonisation cost: `base × (1 + distanceFactor × dist_cœur) × sizeFactor ^ nb_cases` (GDD §2.3).
   * sizeFactor tuned from the GDD's 1.02 to 1.13: each tile makes the next one 13 % dearer.
   */
  distanceFactor: 0.05,
  sizeFactor: 1.13,
  /** Upgrade cost: `base × upgradeCostGrowth ^ level` (GDD §10). */
  upgradeCostGrowth: 1.15,
  /** How many colonisations may grow at the same time; the others wait in the queue. PLACEHOLDER. */
  maxConcurrentGrowths: 1,
} as const;

/**
 * Exhaustion / wear (GDD §2.3, §10), DECIDED: a producing tile wears down steadily and its wear stops
 * at 40 %, so a worn tile still yields 60 %. It reaches the cap after its terrain's `lifetimeMs`.
 * There is no regeneration: wear stays on the tile, even if it changes hands.
 */
export const EXHAUSTION = {
  max: 0.4,
} as const;

/** Nutrient transport to the Cœur (GDD §2.4). */
export const TRANSPORT = {
  /** `perte = 1 % par saut` (GDD §2.4). */
  lossPerHop: 0.01,
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
export const QUEUE_MAX = 10;

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
  hexesPerPlayer: 50,
  /** Spawns sit on the rim, at this share of the radius (GDD §2.5: "bord = zone sûre"). PLACEHOLDER. */
  spawnDistance: 0.85,
  /** Rings of §2.5, as shares of the radius: centre below `centre`, rim above `rim`. PLACEHOLDER. */
  ring: { centre: 1 / 3, rim: 2 / 3 },
  /**
   * Land terrain mix per ring (GDD §2.5: poor rim, rich centre). Rock and Roots are scattered by their
   * own motif; the other terrains follow the main motif in FOREST_TERRAINS order. PLACEHOLDER.
   */
  terrainWeights: {
    rim: { litter: 0.55, humus: 0.31, acid: 0, deadwood: 0.04, stump: 0, roots: 0.07, rock: 0.03 },
    middle: { litter: 0.3, humus: 0.33, acid: 0.07, deadwood: 0.16, stump: 0, roots: 0.08, rock: 0.06 },
    centre: { litter: 0.05, humus: 0.2, acid: 0.1, deadwood: 0.4, stump: 0.14, roots: 0.05, rock: 0.06 },
  } as Readonly<Record<"rim" | "middle" | "centre", Readonly<Record<(typeof FOREST_TERRAINS)[number] | "roots" | "rock", number>>>>,
  /** Yield multiplier: rim ×1, middle ×1.5, centre ×3 at its edge up to ×5 in the middle (GDD §2.5). */
  richness: { rim: 1, middle: 1.5, centreEdge: 3, centreMiddle: 5 },
  /** Rim tiles last longer (GDD §2.5: "peu d'épuisement"). PLACEHOLDER. */
  rimLifetimeFactor: 1.5,
  /** Share of wetlands. PLACEHOLDER. */
  wetlandShare: 0.06,
  /** No wetland within this distance of a spawn. */
  spawnClearRadius: 2,
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
    litter: 10 * 60_000,
    humus: 45 * 60_000,
    deadwood: 2 * HOUR,
    wetland: Infinity,
    stump: 2 * HOUR,
    roots: 45 * 60_000,
    rock: 2 * HOUR,
    acid: 45 * 60_000,
  } as Readonly<Record<Terrain, number>>,
  /** Pressure ratio at which the capture runs at full speed; below 1 nothing happens. */
  fullSpeedRatio: 2,
  /** GDD §6.4: start zone protected for 24 h, within this distance of the spawn. */
  protectedMs: 24 * HOUR,
  protectedRadius: 2,
  /** GDD §6.4: after 2 h of inactivity, captures on your tiles run at half speed. */
  shieldAfterMs: 2 * HOUR,
  shieldFactor: 0.5,
  /** Conquest bonus (GDD §2.5): biomass worth this long of the tile's fresh production. PLACEHOLDER. */
  conquestBonusMs: 1 * HOUR,
} as const;

// ---------------------------------------------------------------------------
// M5 — structures and Enzymes (GDD §3, §4.1). DECIDED: the proposed package; numbers PLACEHOLDER.

export const STRUCTURE_IDS = ["node", "gland", "reservoir", "rhizomorph", "sclerotium", "carpophore"] as const;
/** Nœud de digestion, Glande enzymatique, Réservoir, Rhizomorphe, Sclérote, Carpophore (GDD §4.1). */
export type StructureId = (typeof STRUCTURE_IDS)[number];

export const STRUCTURES = {
  /** Nutrient cost of a structure: `baseCost × costGrowth ^ structures already owned`. */
  baseCost: { node: 20_000, gland: 15_000, reservoir: 15_000, rhizomorph: 12_000, sclerotium: 30_000, carpophore: 25_000 } as Readonly<
    Record<StructureId, number>
  >,
  costGrowth: 1.25,
  /** Nœud de digestion: +50 % on its tile. */
  nodeBonus: 0.5,
  /** Glande enzymatique: its tile yields 50 % less, and it makes Enzymes (twice as many on Dead wood or a Stump). */
  glandPenalty: 0.5,
  glandEnzymesPerSecond: 0.01,
  glandWoodFactor: 2,
  /** Rhizomorphe: captures of its tile run at this speed; crossing it costs no transport hop. */
  rhizomorphCaptureFactor: 0.5,
  /** Sclérote: one per player. */
  sclerotiumMax: 1,
  /** Carpophore: reveals the fog this far; it is seen by every player. */
  carpophoreVision: 3,
  /** Carpophore: +25 % Spores per Carpophore when fruiting (step 3). */
  carpophoreSporeBonus: 0.25,
} as const;

/** GDD §3: Enzymes appear once the player holds this many tiles, or from Tuesday on. */
export const ENZYMES_UNLOCK_TILES = 15;
