/**
 * Axial hex coordinates (pointy-top). See https://www.redblobgames.com/grids/hexagons/
 * The third cube coordinate is implied: s = -q - r.
 */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

export const HEX_DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hex(q: number, r: number): Hex {
  return { q, r };
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d));
}

/** All hexes within `radius` steps of `center` (radius 0 = the center only). */
export function hexesInRadius(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      out.push({ q: center.q + q, r: center.r + r });
    }
  }
  return out;
}

/** Stable string key, handy for Map/Set lookups and database ids. */
export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

const SQRT3 = Math.sqrt(3);

/** Centre of a pointy-top hex of circumradius `size`, with hex (0,0) at the origin. */
export function hexToPixel(h: Hex, size = 1): { x: number; y: number } {
  return { x: size * SQRT3 * (h.q + h.r / 2), y: size * 1.5 * h.r };
}

/** Hex containing the point (x, y), inverse of `hexToPixel`. */
export function pixelToHex(x: number, y: number, size = 1): Hex {
  const q = ((SQRT3 / 3) * x - y / 3) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

/** Rounds fractional axial coordinates to the nearest hex (cube rounding). */
export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // `+ 0` turns a possible -0 into 0 so results compare cleanly.
  return { q: rq + 0, r: rr + 0 };
}
