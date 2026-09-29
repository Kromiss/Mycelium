import { describe, expect, it } from "vitest";
import { MAP, TERRAINS } from "./balance";
import { hexDistance, hexKey } from "./hex";
import { generateMap, START_HEX } from "./mapgen";
import { hashInts, mulberry32 } from "./rng";

describe("rng", () => {
  it("is deterministic", () => {
    expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
    expect(hashInts(1, 2, 3)).not.toBe(hashInts(3, 2, 1));
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("stays in [0, 1)", () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("map generator", () => {
  it("gives the same map for the same seed", () => {
    expect(generateMap(123)).toEqual(generateMap(123));
  });

  it("gives different maps for different seeds", () => {
    const a = generateMap(1).tiles.map((t) => t.terrain).join();
    const b = generateMap(2).tiles.map((t) => t.terrain).join();
    expect(a).not.toBe(b);
  });

  it("covers the whole hexagon exactly once", () => {
    const map = generateMap(99, 6);
    expect(map.tiles).toHaveLength(3 * 6 * 7 + 1);
    expect(new Set(map.tiles.map(hexKey)).size).toBe(map.tiles.length);
    expect(map.tiles.every((t) => hexDistance(t, START_HEX) <= 6)).toBe(true);
  });

  it("starts on Humus", () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const start = generateMap(seed).tiles.find((t) => t.q === START_HEX.q && t.r === START_HEX.r);
      expect(start?.terrain).toBe("humus");
    }
  });

  it("respects the terrain proportions", () => {
    const map = generateMap(2024);
    const n = map.tiles.length;
    for (const t of TERRAINS) {
      const share = map.tiles.filter((x) => x.terrain === t).length / n;
      expect(Math.abs(share - MAP.terrainWeights[t])).toBeLessThan(0.01);
    }
  });

  it("groups terrains in patches", () => {
    // With patches, a tile shares its terrain with its neighbours more often than by chance (~0.36).
    const map = generateMap(77);
    const byKey = new Map(map.tiles.map((t) => [hexKey(t), t.terrain]));
    let same = 0;
    let pairs = 0;
    for (const t of map.tiles) {
      for (const n of [
        { q: t.q + 1, r: t.r },
        { q: t.q, r: t.r + 1 },
        { q: t.q + 1, r: t.r - 1 },
      ]) {
        const other = byKey.get(hexKey(n));
        if (!other) continue;
        pairs++;
        if (other === t.terrain) same++;
      }
    }
    expect(same / pairs).toBeGreaterThan(0.45);
  });
});
