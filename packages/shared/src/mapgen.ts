import { MAP, TERRAINS, type Terrain } from "./balance";
import { hex, hexesInRadius, hexToPixel, type Hex } from "./hex";
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

/** Where every player starts in the solo prototype (the future Cœur, GDD §2.4). */
export const START_HEX: Hex = hex(0, 0);

/**
 * Generates a hexagonal map of the given radius from a seed (GDD §2.1).
 * Terrains form patches (value noise) and appear in exactly the proportions of
 * `MAP.terrainWeights`. The start hex is always Humus. Pure and deterministic.
 */
export function generateMap(seed: number, radius: number = MAP.radius): GeneratedMap {
  const cells = hexesInRadius(START_HEX, radius);
  const noise = cells.map((c) => {
    const { x, y } = hexToPixel(c);
    // Small per-hex jitter breaks ties and roughens patch edges.
    return valueNoise(seed, x / MAP.patchSize, y / MAP.patchSize) + 0.15 * hashFloat(seed, 7, c.q, c.r);
  });

  // Rank tiles by noise and cut the ranking by the target proportions.
  const order = cells.map((_, i) => i).sort((a, b) => noise[a]! - noise[b]!);
  const terrains = new Array<Terrain>(cells.length);
  const total = TERRAINS.reduce((s, t) => s + MAP.terrainWeights[t], 0);
  let cursor = 0;
  let acc = 0;
  for (const t of TERRAINS) {
    acc += MAP.terrainWeights[t] / total;
    const end = t === TERRAINS[TERRAINS.length - 1] ? cells.length : Math.round(acc * cells.length);
    for (; cursor < end; cursor++) terrains[order[cursor]!] = t;
  }

  const tiles = cells.map((c, i) => ({
    q: c.q,
    r: c.r,
    terrain: c.q === START_HEX.q && c.r === START_HEX.r ? ("humus" as const) : terrains[i]!,
  }));
  return { seed, radius, tiles };
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
