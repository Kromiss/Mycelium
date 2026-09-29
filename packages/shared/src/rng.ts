/** Deterministic pseudo-random helpers: same seed, same map, on every machine. */

/** Mixes integers into a well-distributed unsigned 32-bit hash. */
export function hashInts(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Uniform float in [0, 1) derived from the given integers. */
export function hashFloat(...values: number[]): number {
  return hashInts(...values) / 0x1_0000_0000;
}

/** Mulberry32 generator: returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

/** Random seed for a new map (32-bit unsigned). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x1_0000_0000);
}
