import { describe, expect, it } from "vitest";
import { STRAINS } from "./balance";
import { joinForest, newForest, refreshReservations, resolveBorders, type ForestState } from "./forest";
import { checkChooseStrain, colonizationCost, newGame, productionRate, type GameState } from "./game";
import { hex, hexesInRadius, hexKey, type Hex } from "./hex";

const T0 = Date.UTC(2026, 9, 5);
const DAY = 24 * 3_600_000;

describe("Moisissure (M7 reward strain)", () => {
  it("must be unlocked before it can be chosen", () => {
    const g = newGame(1, T0);
    expect(checkChooseStrain(g, "mold")).toEqual({ ok: false, error: "locked" });
    expect(checkChooseStrain(g, "pleurotus")).toEqual({ ok: true });
    g.unlockedStrains.push("mold");
    expect(checkChooseStrain(g, "mold")).toEqual({ ok: true });
  });

  it("colonises worn tiles 30 % cheaper and produces 10 % less", () => {
    const g = newGame(1, T0);
    const tile = [...g.tiles.values()].find((t) => t.owner === null && t.terrain === "humus")!;
    const fresh = colonizationCost(g, tile);
    const before = productionRate(g, T0);
    g.strain = "mold";
    expect(colonizationCost(g, tile)).toBeCloseTo(fresh, 9);
    tile.exhaustion = STRAINS.mold.wornAt;
    expect(colonizationCost(g, tile)).toBeCloseTo(fresh * STRAINS.mold.colonizationCost, 9);
    expect(productionRate(g, T0)).toBeCloseTo(before * STRAINS.mold.production, 9);
  });

  it("takes worn enemy tiles twice as fast", () => {
    const timeFor = (strain: GameState["strain"], wear: number) => {
      const { f, a, border } = arena();
      a.strain = strain;
      f.tiles.get(hexKey(border))!.exhaustion = wear;
      for (let t = T0 + 5_000; t <= T0 + DAY; t += 5_000) {
        resolveBorders(f, 5_000, t);
        if (f.tiles.get(hexKey(border))!.owner === "a") return t - T0;
      }
      return Infinity;
    };
    const normal = timeFor(null, 0.3);
    expect(normal).toBeLessThan(Infinity);
    expect(timeFor("mold", 0.1)).toBe(normal);
    expect(timeFor("mold", 0.3)).toBeCloseTo(normal / STRAINS.mold.captureSpeed, -4);
  });
});

/** `a` (a disc of radius 2) touches `b` (a block of 9 tiles) on (1,0). */
function arena(): { f: ForestState; a: GameState; b: GameState; border: Hex } {
  const f = newForest(11, T0 - 2 * DAY, 4, { calendar: false });
  for (const t of f.tiles.values()) t.terrain = "litter";
  const a = joinForest(f, "a", T0 - 2 * DAY)!;
  const b = joinForest(f, "b", T0 - 2 * DAY)!;
  for (const t of f.tiles.values()) t.owner = null;
  a.heart = hex(-1, 0);
  for (const h of hexesInRadius(a.heart, 2)) f.tiles.get(hexKey(h))!.owner = "a";
  // Above the floor of 7 tiles, so that it can lose one.
  b.heart = hex(4, 0);
  for (let q = 2; q <= 5; q++) for (const r of [0, -1]) f.tiles.get(hexKey(hex(q, r)))!.owner = "b";
  f.tiles.get(hexKey(hex(1, 0)))!.owner = "b";
  for (const p of [a, b]) {
    p.lastSeenAt = null;
    p.updatedAt = T0;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}
