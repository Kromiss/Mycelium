import { FOREST, FOREST_TERRAINS, RUIN_PLACE, ZONES, type Terrain } from "./balance";
import { hex, hexDistance, hexesInRadius, hexKey, hexNeighbors, hexToPixel, type Hex } from "./hex";
import type { GeneratedMap, MapTile } from "./mapgen";
import { hashFloat } from "./rng";

/**
 * Shared forest maps (GDD §2.5, validated): the forest is cut into identical slices, one per
 * player, generated from the same motif and rotated; land gets richer towards the centre.
 */

export type MapLayout = { kind: "solo" } | { kind: "forest"; capacity: number };
export type Ring = "rim" | "middle" | "centre";

export const FOREST_CENTRE: Hex = hex(0, 0);

export interface ForestMap extends GeneratedMap {
  /** Spawn tile of each slice, in slice order. */
  readonly spawns: readonly Hex[];
}

/**
 * Distance from the centre in hex steps, measured as the crow flies (a hex step is √3 pixels).
 * Forests are round, not hexagonal, so that every slice gets the same share of the map.
 */
export function centreDistance(h: Hex): number {
  const { x, y } = hexToPixel(h);
  return Math.hypot(x, y) / Math.sqrt(3);
}

/** Hexes of a round forest of the given radius. */
export function forestCells(radius: number): Hex[] {
  return hexesInRadius(FOREST_CENTRE, Math.ceil(radius * 1.2)).filter((c) => centreDistance(c) <= radius + 0.5);
}

/** Smallest round forest holding `FOREST.hexesPerPlayer` hexes per player (GDD §2.1: 40 to 60). */
export function forestRadius(capacity: number): number {
  let r = 1;
  while (forestCells(r).length < capacity * FOREST.hexesPerPlayer) r++;
  return r;
}

export function ringAt(radius: number, h: Hex): Ring {
  // Pure function of the place: kept per tile object (M9 speed-up).
  const cached = ringCache.get(h);
  if (cached !== undefined && cached.radius === radius && cached.q === h.q && cached.r === h.r) return cached.ring;
  const ring = computeRing(radius, h);
  ringCache.set(h, { radius, q: h.q, r: h.r, ring });
  return ring;
}

const ringCache = new WeakMap<Hex, { radius: number; q: number; r: number; ring: Ring }>();

function computeRing(radius: number, h: Hex): Ring {
  const rho = centreDistance(h) / radius;
  if (rho <= FOREST.ring.centre) return "centre";
  if (rho <= FOREST.ring.rim) return "middle";
  return "rim";
}

/**
 * Zone of a tile (M9, DECIDED): 7 rings of the same thickness, 1 on the rim to 7 in the centre. Always 1 on
 * solo maps.
 */
export function zoneAt(layout: MapLayout, radius: number, h: Hex): number {
  if (layout.kind === "solo") return 1;
  const cached = zoneCache.get(h);
  if (cached !== undefined && cached.radius === radius && cached.q === h.q && cached.r === h.r) return cached.zone;
  const zone = zoneOf(radius, h);
  zoneCache.set(h, { radius, q: h.q, r: h.r, zone });
  return zone;
}

const zoneCache = new WeakMap<Hex, { radius: number; q: number; r: number; zone: number }>();

/**
 * Zone at a distance from the centre: `count` rings of equal thickness (the rim's outer edge included),
 * measured on the radial bands of the slices (distance rounded to a whole hex step), so that a place has
 * the same zone in every slice.
 */
export function zoneOf(radius: number, h: Hex): number {
  const rho = Math.round(centreDistance(h)) / radius;
  return ZONES.count - Math.min(ZONES.count - 1, Math.max(0, Math.floor(rho * ZONES.count)));
}

/** A per-zone value (zone 1 … 7) of a ZONES table. */
export function zoneValue(table: readonly number[], zone: number): number {
  return table[Math.max(1, Math.min(table.length, zone)) - 1]!;
}

/** Yield multiplier of a tile (M9: by zone, ×1 on the rim to ×7.5 in the centre). Always 1 on solo maps. */
export function richnessAt(layout: MapLayout, radius: number, h: Hex): number {
  if (layout.kind === "solo") return 1;
  // Pure function of the place: kept per tile object (M9 speed-up).
  const cached = richnessCache.get(h);
  if (cached !== undefined && cached.radius === radius && cached.q === h.q && cached.r === h.r) return cached.value;
  const value = computeRichness(radius, h);
  richnessCache.set(h, { radius, q: h.q, r: h.r, value });
  return value;
}

const richnessCache = new WeakMap<Hex, { radius: number; q: number; r: number; value: number }>();

function computeRichness(radius: number, h: Hex): number {
  return zoneValue(ZONES.richness, zoneOf(radius, h));
}

/** Where a hex sits in the forest's slices. */
export interface Placement {
  /** Radial band: distance to the centre, rounded to a whole hex step. */
  band: number;
  /** Slice (0 … capacity − 1): one per player. */
  slice: number;
  /** Relative position inside the slice for this band, from 0 to 1. */
  p: number;
}

const placements = new Map<string, Map<string, Placement>>();

/**
 * Cuts every radial band of the forest into `capacity` runs of consecutive hexes (by angle) of
 * equal length (±1). Slices therefore hold the same number of hexes band by band, whatever the
 * hex grid does, and "the same place in another slice" is simply the same (band, p).
 */
export function forestPlacement(capacity: number, radius: number): Map<string, Placement> {
  const id = `${capacity}:${radius}`;
  const cached = placements.get(id);
  if (cached) return cached;
  const bands = new Map<number, Hex[]>();
  for (const c of forestCells(radius)) {
    const b = Math.round(centreDistance(c));
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b)!.push(c);
  }
  const out = new Map<string, Placement>();
  // Bands rarely divide evenly: the extra hexes go to the slices that have the fewest so far,
  // so that whole slices differ by one hex at most.
  const totals = new Array<number>(capacity).fill(0);
  for (const band of [...bands.keys()].sort((a, b) => a - b)) {
    const hexes = bands.get(band)!.sort((a, b) => angleOf(a) - angleOf(b));
    const n = hexes.length;
    const base = Math.floor(n / capacity);
    const byNeed = [...totals.keys()].sort((a, b) => totals[a]! - totals[b]! || a - b);
    const extra = new Set(byNeed.slice(0, n - base * capacity));
    // Positions are taken on the longest run of the band; a shorter run skips its middle position,
    // so it keeps the same motif minus one hex.
    const longest = extra.size > 0 ? base + 1 : base;
    let start = 0;
    for (let slice = 0; slice < capacity; slice++) {
      const size = base + (extra.has(slice) ? 1 : 0);
      const skip = size < longest ? Math.floor(longest / 2) : Infinity;
      for (let i = 0; i < size; i++) {
        const j = i < skip ? i : i + 1;
        out.set(hexKey(hexes[start + i]!), { band, slice, p: (j + 0.5) / longest });
      }
      start += size;
      totals[slice]! += size;
    }
  }
  placements.set(id, out);
  return out;
}

/** Spawn of each slice: in the rim band, in the middle of the slice. */
export function forestSpawns(capacity: number, radius: number): Hex[] {
  const band = Math.round(FOREST.spawnDistance * radius);
  const placement = forestPlacement(capacity, radius);
  const bySlice: Array<Array<[Hex, number]>> = Array.from({ length: capacity }, () => []);
  for (const c of forestCells(radius)) {
    const pl = placement.get(hexKey(c))!;
    if (pl.band === band) bySlice[pl.slice]!.push([c, pl.p]);
  }
  return bySlice.map((run) => run.reduce((best, cur) => (Math.abs(cur[1] - 0.5) < Math.abs(best[1] - 0.5) ? cur : best))[0]);
}

/**
 * Generates a forest for `capacity` players. A tile's terrain depends only on its band and its
 * relative position in its slice, so every slice follows the same motif.
 */
export function generateForestMap(seed: number, capacity: number = FOREST.capacity): ForestMap {
  const radius = forestRadius(capacity);
  const cells = forestCells(radius);
  const placement = forestPlacement(capacity, radius);
  const spawns = forestSpawns(capacity, radius);
  const spawnKeys = new Set(spawns.map(hexKey));
  const nearSpawn = (h: Hex) => spawns.some((s) => hexDistance(s, h) <= FOREST.spawnClearRadius);
  // The same test by position in the slice: a position is kept clear if it is near the spawn in any
  // slice, so that every slice keeps the same positions clear (hex disks do not rotate exactly).
  const clearPositions = new Set<string>();
  const positionKey = (h: Hex) => {
    const pl = placement.get(hexKey(h))!;
    return `${pl.band}:${pl.p}`;
  };
  for (const c of cells) if (nearSpawn(c)) clearPositions.add(positionKey(c));
  const inStartZone = (h: Hex) => clearPositions.has(positionKey(h));

  const motif = (salt: number, c: Hex) => {
    const { band, p } = placement.get(hexKey(c))!;
    const arc = (2 * Math.PI * Math.max(band, 0.5)) / capacity; // slice width in hexes at this band
    return valueNoise(seed ^ salt, (p * arc) / 2.5, band / 2.5) + 0.12 * hashFloat(seed ^ salt, 7, Math.floor(p * 16), band);
  };
  /** Value below which a share `q` of slice 0's tiles fall: the same cut is applied to every slice. */
  const cut = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return q <= 0 ? -Infinity : q >= 1 ? Infinity : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  };
  const inSlice0 = (c: Hex) => placement.get(hexKey(c))!.slice === 0;

  // Wetlands: highest values of their own motif, away from spawns and the very centre. The share is
  // halved until every spawn can still reach the centre on land.
  let wet = new Set<string>();
  for (let share: number = FOREST.wetlandShare; ; share /= 2) {
    wet = new Set<string>();
    const eligible = cells.filter((c) => !nearSpawn(c) && centreDistance(c) > 1);
    const threshold = cut(eligible.filter(inSlice0).map((c) => -motif(0x5bd1e995, c)), share * (cells.length / eligible.length));
    for (const c of eligible) if (-motif(0x5bd1e995, c) < threshold) wet.add(hexKey(c));
    const reached = floodLand(cells, wet);
    if (spawns.every((sp) => reached.has(hexKey(sp))) || share < 0.005) {
      for (const c of cells) if (!reached.has(hexKey(c))) wet.add(hexKey(c));
      break;
    }
  }

  // Land terrains: thresholds from slice 0 of each ring, applied to every slice of that ring.
  // Rock and Roots come first, as small scattered spots of their own motifs (never in a start zone);
  // the rest follows the main motif, from Litter (low values) to Stumps (high values).
  const terrainOf = new Map<string, Terrain>();
  for (const ring of ["rim", "middle", "centre"] as const) {
    let land = cells.filter((c) => !wet.has(hexKey(c)) && ringAt(radius, c) === ring);
    // The centre is shared: use all of it as reference.
    const referenceOf = (pool: Hex[]) => {
      const ref = pool.filter(inSlice0);
      return ring === "centre" || ref.length < 10 ? pool : ref;
    };
    const w = FOREST.terrainWeights[ring];
    const total = land.length;
    for (const [terrain, salt] of [["rock", 0x27d4eb2f], ["roots", 0x165667b1]] as const) {
      const eligible = land.filter((c) => !inStartZone(c));
      if (w[terrain] <= 0 || eligible.length === 0) continue;
      // Highest values of the terrain's motif, for a share `w` of the whole ring (rounded to the nearest
      // tile, so that a small share still places a few).
      const reference = referenceOf(eligible).map((c) => -motif(salt, c)).sort((x, y) => x - y);
      const index = Math.round(((w[terrain] * total) / eligible.length) * reference.length);
      const threshold = index >= reference.length ? Infinity : reference[index]!;
      const picked = new Set(eligible.filter((c) => -motif(salt, c) < threshold).map(hexKey));
      for (const k of picked) terrainOf.set(k, terrain);
      land = land.filter((c) => !picked.has(hexKey(c)));
    }
    const values = referenceOf(land).map((c) => motif(0, c));
    const present = FOREST_TERRAINS.filter((t) => w[t] > 0);
    const rest = present.reduce((sum, t) => sum + w[t], 0);
    let acc = 0;
    const cuts = present.map((t, i) => {
      acc += w[t] / rest;
      return [t, i === present.length - 1 ? Infinity : cut(values, acc)] as const;
    });
    for (const c of land) {
      const m = motif(0, c);
      terrainOf.set(hexKey(c), cuts.find(([, limit]) => m < limit)![0]);
    }
  }
  for (const k of spawnKeys) terrainOf.set(k, "humus");
  // M7: one Ruine per slice, at the same place in every slice (middle ring, off the spawn axis, on land).
  for (const k of ruinKeys(cells, placement, radius, wet, inStartZone)) terrainOf.set(k, "ruin");

  const tiles: MapTile[] = cells.map((c) => ({
    q: c.q,
    r: c.r,
    terrain: wet.has(hexKey(c)) ? "wetland" : terrainOf.get(hexKey(c))!,
  }));
  return { seed, radius, tiles, spawns };
}

/**
 * The Ruine of each slice: in the band at RUIN_PLACE.distance of the radius, the land position of slice 0
 * closest to RUIN_PLACE.p, then that same position in every slice (wetlands follow the slice motif, so
 * the position is land everywhere).
 */
function ruinKeys(cells: Hex[], placement: Map<string, Placement>, radius: number, wet: Set<string>, inStartZone: (h: Hex) => boolean): string[] {
  const band = Math.round(RUIN_PLACE.distance * radius);
  const candidates = cells
    .map((c) => ({ c, pl: placement.get(hexKey(c))! }))
    .filter(({ c, pl }) => pl.band === band && pl.slice === 0 && !wet.has(hexKey(c)) && !inStartZone(c) && ringAt(radius, c) === "middle");
  if (candidates.length === 0) return [];
  const best = candidates.reduce((a, b) => (Math.abs(b.pl.p - RUIN_PLACE.p) < Math.abs(a.pl.p - RUIN_PLACE.p) ? b : a));
  return cells
    .filter((c) => {
      const pl = placement.get(hexKey(c))!;
      return pl.band === band && pl.p === best.pl.p && !wet.has(hexKey(c));
    })
    .map(hexKey);
}

function angleOf(h: Hex): number {
  const { x, y } = hexToPixel(h);
  const a = Math.atan2(y, x);
  return a < 0 ? a + 2 * Math.PI : a;
}

function floodLand(cells: Hex[], wet: Set<string>): Set<string> {
  const inMap = new Set(cells.map(hexKey));
  const reached = new Set([hexKey(FOREST_CENTRE)]);
  const stack: Hex[] = [FOREST_CENTRE];
  while (stack.length) {
    for (const n of hexNeighbors(stack.pop()!)) {
      const k = hexKey(n);
      if (inMap.has(k) && !wet.has(k) && !reached.has(k)) {
        reached.add(k);
        stack.push(n);
      }
    }
  }
  return reached;
}

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
