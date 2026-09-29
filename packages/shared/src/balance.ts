/**
 * Every tunable number of the game lives here (GDD §10: "formules de base, à équilibrer").
 * Values marked PLACEHOLDER are not in the GDD yet: they are starting points and are expected
 * to change during balancing. Values marked DECIDED were chosen by the owner.
 */

const HOUR = 3_600_000;

export const TERRAINS = ["litter", "humus", "deadwood", "wetland"] as const;
/** Litière de feuilles, Humus, Bois mort (M1) and Ruisseau / Zone humide (M2), GDD §2.2. */
export type Terrain = (typeof TERRAINS)[number];
/** Terrains a player can colonise. */
export const LAND_TERRAINS = ["litter", "humus", "deadwood"] as const satisfies readonly Terrain[];

export interface TerrainStats {
  /** Can be colonised. Wetlands need a mutation (GDD §2.2), which arrives in M5. */
  readonly colonizable: boolean;
  /** Nutrients per second produced by one colonised tile (GDD §2.2 "Rendement"). PLACEHOLDER. */
  readonly yieldPerSecond: number;
  /** `base_terrain` of the colonisation cost formula (GDD §2.3). PLACEHOLDER. */
  readonly baseCost: number;
  /** Hyphae growth time before the tile is colonised, in seconds (GDD §2.3: 30 s to a few minutes). PLACEHOLDER. */
  readonly growthSeconds: number;
  /** `durée_vie_terrain` (GDD §10): occupied time after which the tile is fully exhausted, in ms. DECIDED. */
  readonly lifetimeMs: number;
  /** Nutrient reserve of a fresh tile, stored in `hex.reserve`. Unused by the rules (exhaustion is time-based). */
  readonly reserve: number;
}

export const TERRAIN_STATS: Readonly<Record<Terrain, TerrainStats>> = {
  // GDD §2.2: low yield, very low cost — ideal to spread fast.
  litter: { colonizable: true, yieldPerSecond: 0.5, baseCost: 5, growthSeconds: 30, lifetimeMs: 2 * HOUR, reserve: 500 },
  // GDD §2.2: medium yield, low cost — the base terrain.
  humus: { colonizable: true, yieldPerSecond: 1, baseCost: 10, growthSeconds: 60, lifetimeMs: 8 * HOUR, reserve: 2_000 },
  // GDD §2.2: high yield, medium cost; exhausts, then becomes Humus.
  deadwood: { colonizable: true, yieldPerSecond: 3, baseCost: 25, growthSeconds: 120, lifetimeMs: 4 * HOUR, reserve: 5_000 },
  // GDD §2.2: cannot be colonised without a mutation; boosts humidity of adjacent tiles.
  wetland: { colonizable: false, yieldPerSecond: 0, baseCost: 0, growthSeconds: 0, lifetimeMs: 0, reserve: 0 },
};

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
  /** Nutrients a new player starts with. PLACEHOLDER. */
  startingNutrients: 10,
  /** `taux_conversion` of GDD §10: share of production also credited as Biomass. PLACEHOLDER. */
  biomassConversionRate: 0.1,
  /** Colonisation cost: `base × (1 + distanceFactor × dist_cœur) × sizeFactor ^ nb_cases` (GDD §2.3). */
  distanceFactor: 0.05,
  sizeFactor: 1.02,
  /** Upgrade cost: `base × upgradeCostGrowth ^ level` (GDD §10). */
  upgradeCostGrowth: 1.15,
  /** How many colonisations may grow at the same time; the others wait in the queue. PLACEHOLDER. */
  maxConcurrentGrowths: 1,
} as const;

/** Exhaustion (GDD §2.3, §10): `épuisement = min(max, temps_occupé / durée_vie_terrain)`. */
export const EXHAUSTION = {
  /** Cap of the exhaustion: an exhausted tile still yields 10 %. GDD §10. */
  max: 0.9,
  /** A resting tile (not producing) recovers this many times slower than it exhausts. DECIDED. */
  regenSlowdown: 4,
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

// ---------------------------------------------------------------------------
// M3 — shared forests (GDD §2.1, §2.5, §6)

export const FOREST = {
  /** Players per forest (GDD §14: 20 to 30). PLACEHOLDER within that range. */
  capacity: 24,
  /** Target number of hexes per player (GDD §2.1: 40 to 60); the map radius follows from it. */
  hexesPerPlayer: 50,
  /** Spawns sit on the rim, at this share of the radius (GDD §2.5: "bord = zone sûre"). PLACEHOLDER. */
  spawnDistance: 0.85,
  /** Rings of §2.5, as shares of the radius: centre below `centre`, rim above `rim`. PLACEHOLDER. */
  ring: { centre: 1 / 3, rim: 2 / 3 },
  /** Land terrain mix per ring (litter / humus / deadwood). PLACEHOLDER. */
  terrainWeights: {
    rim: { litter: 0.6, humus: 0.35, deadwood: 0.05 },
    middle: { litter: 0.35, humus: 0.45, deadwood: 0.2 },
    centre: { litter: 0.1, humus: 0.3, deadwood: 0.6 },
  },
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
  captureMs: { litter: 10 * 60_000, humus: 45 * 60_000, deadwood: 2 * HOUR, wetland: Infinity } as Readonly<Record<Terrain, number>>,
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
