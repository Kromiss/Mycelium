/**
 * Every tunable number of the game lives here (GDD §10: "formules de base, à équilibrer").
 * Values marked PLACEHOLDER are not in the GDD yet: they are starting points for the solo
 * prototype and are expected to change during balancing.
 */

export const TERRAINS = ["litter", "humus", "deadwood"] as const;
/** M1 terrains (GDD §14): Litière de feuilles, Humus, Bois mort. */
export type Terrain = (typeof TERRAINS)[number];

export interface TerrainStats {
  /** Nutrients per second produced by one colonised tile (GDD §2.2 "Rendement"). PLACEHOLDER. */
  readonly yieldPerSecond: number;
  /** `base_terrain` of the colonisation cost formula (GDD §2.3). PLACEHOLDER. */
  readonly baseCost: number;
  /** Hyphae growth time before the tile is colonised, in seconds (GDD §2.3: 30 s to a few minutes). PLACEHOLDER. */
  readonly growthSeconds: number;
  /** Nutrient reserve of a fresh tile (GDD §2.3). Stored now, depleted from M2 on. PLACEHOLDER. */
  readonly reserve: number;
}

export const TERRAIN_STATS: Readonly<Record<Terrain, TerrainStats>> = {
  // GDD §2.2: low yield, very low cost — ideal to spread fast.
  litter: { yieldPerSecond: 0.5, baseCost: 5, growthSeconds: 30, reserve: 500 },
  // GDD §2.2: medium yield, low cost — the base terrain.
  humus: { yieldPerSecond: 1, baseCost: 10, growthSeconds: 60, reserve: 2_000 },
  // GDD §2.2: high yield, medium cost.
  deadwood: { yieldPerSecond: 3, baseCost: 25, growthSeconds: 120, reserve: 5_000 },
};

export const MAP = {
  /** Radius of the solo prototype map: 3r(r+1)+1 = 331 hexes. PLACEHOLDER (final shape decided in M3, GDD §2.5). */
  radius: 10,
  /** Share of each terrain in generated maps, in the order litter, humus, deadwood. PLACEHOLDER. */
  terrainWeights: { litter: 0.4, humus: 0.4, deadwood: 0.2 } as Readonly<Record<Terrain, number>>,
  /** Size, in hexes, of the terrain patches produced by the generator's noise. */
  patchSize: 2.5,
} as const;

export const ECONOMY = {
  /** Nutrients a new player starts with. PLACEHOLDER. */
  startingNutrients: 10,
  /** `taux_conversion` of GDD §10: share of production also credited as Biomass. PLACEHOLDER. */
  biomassConversionRate: 0.1,
  /** Colonisation cost: `base × (1 + distanceFactor × dist_cœur) × sizeFactor ^ nb_cases` (GDD §2.3). */
  distanceFactor: 0.05,
  sizeFactor: 1.02,
  /** Upgrade cost: `base × upgradeCostGrowth ^ level` (GDD §10). */
  upgradeCostGrowth: 1.15,
  /** How many colonisations may grow at the same time. The expansion queue comes in M2 (GDD §9). PLACEHOLDER. */
  maxConcurrentGrowths: 1,
} as const;

/** Server simulation tick (GDD §12: 1 tick every 5 s). */
export const TICK_MS = 5_000;

export const UPGRADE_IDS = ["digestion", "hyphalGrowth", "thriftyExpansion", "biomassConversion", "woodDecomposer"] as const;
/** The five M1 upgrades (GDD §14). */
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export interface UpgradeStats {
  /** Cost of level 1; level n+1 costs `baseCost × 1.15^n`. PLACEHOLDER. */
  readonly baseCost: number;
  /** Effect per level, as a fraction (0.1 = 10 %), from the GDD §14 table. */
  readonly perLevel: number;
}

export const UPGRADE_STATS: Readonly<Record<UpgradeId, UpgradeStats>> = {
  /** Digestion accrue: +10 % yield on every tile per level (additive). */
  digestion: { baseCost: 25, perLevel: 0.1 },
  /** Croissance des hyphes: −8 % growth time per level (compounded: × 0.92^level). */
  hyphalGrowth: { baseCost: 40, perLevel: 0.08 },
  /** Expansion économe: −5 % colonisation cost per level (compounded: × 0.95^level). */
  thriftyExpansion: { baseCost: 50, perLevel: 0.05 },
  /** Conversion en biomasse: +10 % conversion rate per level (additive). */
  biomassConversion: { baseCost: 30, perLevel: 0.1 },
  /** Décomposeur de bois: +15 % Dead wood yield per level (additive). */
  woodDecomposer: { baseCost: 60, perLevel: 0.15 },
};
