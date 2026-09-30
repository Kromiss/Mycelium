import { LAND_TERRAINS, MAP, type Terrain } from "./balance";
import { hex, hexDistance, hexesInRadius, hexKey, hexNeighbors, hexToPixel, type Hex } from "./hex";
import { hashFloat } from "./rng";

export interface MapTile extends Hex {
  readonly terrain: Terrain;
}

export interface GeneratedMap {
  readonly seed: number;
  readonly radius: number;
  /** Tiles in a stable order (the order of `hexesInRadius`). */
  readonly tiles: readonly MapTile[];
}

/** Where every player starts in the solo prototype (the initial Cœur, GDD §2.4). */
export const START_HEX: Hex = hex(0, 0);

/**
 * Generates a hexagonal map of the given radius from a seed (GDD §2.1). Pure and deterministic.
 * - Wetlands form ponds (value noise), never near the start, and never cut off land: land that
 *   cannot be reached from the start without crossing water is turned into wetland.
 * - Land terrains form patches and appear in exactly the proportions of `MAP.terrainWeights`.
 * - The start hex is always Humus.
 */
export function generateMap(seed: number, radius: number = MAP.radius): GeneratedMap {
  const cells = hexesInRadius(START_HEX, radius);
  const wet = new Set<string>();

  // 1. Wetlands: the highest values of a separate noise layer, outside the start area.
  const candidates = cells.filter((c) => hexDistance(c, START_HEX) > MAP.wetlandFreeRadius);
  const wetNoise = new Map(candidates.map((c) => [hexKey(c), noiseAt(seed ^ 0x5bd1e995, c)]));
  const byWetness = [...candidates].sort((a, b) => wetNoise.get(hexKey(b))! - wetNoise.get(hexKey(a))!);
  const wetCount = Math.round(MAP.wetlandShare * cells.length);
  for (const c of byWetness.slice(0, wetCount)) wet.add(hexKey(c));

  // 2. Land that the start cannot reach becomes wetland too (enclosed ponds merge).
  const inMap = new Set(cells.map(hexKey));
  const reached = new Set<string>([hexKey(START_HEX)]);
  const frontier: Hex[] = [START_HEX];
  while (frontier.length) {
    const h = frontier.pop()!;
    for (const n of hexNeighbors(h)) {
      const k = hexKey(n);
      if (inMap.has(k) && !wet.has(k) && !reached.has(k)) {
        reached.add(k);
        frontier.push(n);
      }
    }
  }
  for (const c of cells) if (!reached.has(hexKey(c))) wet.add(hexKey(c));

  // 3. Land terrains: rank land tiles by noise and cut the ranking by the target proportions.
  const land = cells.filter((c) => !wet.has(hexKey(c)));
  const landNoise = land.map((c) => noiseAt(seed, c));
  const order = land.map((_, i) => i).sort((a, b) => landNoise[a]! - landNoise[b]!);
  const terrainOf = new Map<string, Terrain>();
  const total = LAND_TERRAINS.reduce((s, t) => s + MAP.terrainWeights[t], 0);
  let cursor = 0;
  let acc = 0;
  for (const t of LAND_TERRAINS) {
    acc += MAP.terrainWeights[t] / total;
    const end = t === LAND_TERRAINS[LAND_TERRAINS.length - 1] ? land.length : Math.round(acc * land.length);
    for (; cursor < end; cursor++) terrainOf.set(hexKey(land[order[cursor]!]!), t);
  }
  terrainOf.set(hexKey(START_HEX), "humus");

  const tiles = cells.map((c) => ({ q: c.q, r: c.r, terrain: wet.has(hexKey(c)) ? ("wetland" as const) : terrainOf.get(hexKey(c))! }));
  return { seed, radius, tiles };
}

/** Patchy noise at a hex, with a little per-hex jitter to break ties and roughen edges. */
function noiseAt(seed: number, c: Hex): number {
  const { x, y } = hexToPixel(c);
  return valueNoise(seed, x / MAP.patchSize, y / MAP.patchSize) + 0.15 * hashFloat(seed, 7, c.q, c.r);
}

/** Smooth 2D value noise in [0, 1) on a unit lattice. */
function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const v = (i: number, j: number) => hashFloat(seed, x0 + i, y0 + j);
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx;
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
