import { describe, expect, it } from "vitest";
import { ECONOMY, TERRAIN_STATS, UPGRADE_IDS, type Terrain } from "./balance";
import {
  advance,
  buyUpgrade,
  checkColonize,
  cloneGame,
  colonizationCost,
  colonize,
  conversionRate,
  growthDurationMs,
  newGame,
  productionRate,
  tileYield,
  upgradeCost,
  type GameState,
} from "./game";
import { hex, hexKey, type Hex } from "./hex";
import { fromSnapshot, toSnapshot } from "./protocol";

const T0 = 1_700_000_000_000;

/** A small game where every tile has the given terrain (the start tile stays Humus). */
function game(terrain: Terrain = "humus", nutrients = 1_000): GameState {
  const state = newGame(1, T0, 3);
  for (const [k, t] of state.tiles) {
    if (!(t.q === 0 && t.r === 0)) state.tiles.set(k, { ...t, terrain });
  }
  state.nutrients = nutrients;
  return state;
}

const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;

describe("new game", () => {
  it("owns only the start tile and has the starting nutrients", () => {
    const s = newGame(5, T0);
    const owned = [...s.tiles.values()].filter((t) => t.owned);
    expect(owned).toEqual([{ q: 0, r: 0, terrain: "humus", owned: true, growthEndsAt: null }]);
    expect(s.nutrients).toBe(ECONOMY.startingNutrients);
    expect(s.biomass).toBe(0);
    expect(Object.values(s.upgrades).every((l) => l === 0)).toBe(true);
  });
});

describe("costs", () => {
  it("follows base × (1 + 0.05 × dist) × 1.02^tiles", () => {
    const s = game("litter");
    // 1 tile owned, target at distance 1.
    expect(colonizationCost(s, tileAt(s, hex(1, 0)))).toBeCloseTo(5 * 1.05 * 1.02, 10);
    // Distance 3.
    expect(colonizationCost(s, tileAt(s, hex(3, 0)))).toBeCloseTo(5 * 1.15 * 1.02, 10);
  });

  it("grows with the number of owned tiles", () => {
    const s = game("litter");
    const before = colonizationCost(s, tileAt(s, hex(2, 0)));
    tileAt(s, hex(1, 0)).owned = true;
    expect(colonizationCost(s, tileAt(s, hex(2, 0)))).toBeCloseTo(before * 1.02, 10);
  });

  it("is reduced by Expansion économe (−5 % per level, compounded)", () => {
    const s = game("humus");
    const base = colonizationCost(s, tileAt(s, hex(1, 0)));
    s.upgrades.thriftyExpansion = 2;
    expect(colonizationCost(s, tileAt(s, hex(1, 0)))).toBeCloseTo(base * 0.95 * 0.95, 10);
  });

  it("prices upgrades at base × 1.15^level", () => {
    for (const id of UPGRADE_IDS) {
      expect(upgradeCost(id, 3) / upgradeCost(id, 0)).toBeCloseTo(1.15 ** 3, 10);
    }
  });
});

describe("colonisation", () => {
  it("only accepts wild tiles adjacent to the network", () => {
    const s = game();
    expect(checkColonize(s, hex(2, 0))).toEqual({ ok: false, error: "not_adjacent" });
    expect(checkColonize(s, hex(0, 0))).toEqual({ ok: false, error: "already_owned" });
    expect(checkColonize(s, hex(40, 0))).toEqual({ ok: false, error: "unknown_tile" });
    expect(checkColonize(s, hex(1, 0))).toEqual({ ok: true });
  });

  it("requires enough nutrients", () => {
    const s = game("humus", 1);
    expect(checkColonize(s, hex(1, 0))).toEqual({ ok: false, error: "not_enough_nutrients" });
  });

  it("pays, then grows for the terrain's growth time", () => {
    const s = game("deadwood");
    const cost = colonizationCost(s, tileAt(s, hex(0, 1)));
    expect(colonize(s, hex(0, 1), T0)).toEqual({ ok: true });
    expect(s.nutrients).toBeCloseTo(1_000 - cost, 10);
    const t = tileAt(s, hex(0, 1));
    expect(t.owned).toBe(true);
    expect(t.growthEndsAt).toBe(T0 + TERRAIN_STATS.deadwood.growthSeconds * 1000);
  });

  it("limits simultaneous growths", () => {
    const s = game();
    colonize(s, hex(1, 0), T0);
    expect(checkColonize(s, hex(-1, 0))).toEqual({ ok: false, error: "growth_limit" });
  });

  it("cannot chain from a tile that is still growing", () => {
    const s = game();
    colonize(s, hex(1, 0), T0);
    advance(s, T0 + 1_000);
    expect(checkColonize(s, hex(2, 0)).ok).toBe(false);
    advance(s, T0 + growthDurationMs("humus", s.upgrades));
    expect(checkColonize(s, hex(2, 0))).toEqual({ ok: true });
  });

  it("grows faster with Croissance des hyphes (−8 % per level, compounded)", () => {
    const s = game();
    s.upgrades.hyphalGrowth = 3;
    expect(growthDurationMs("humus", s.upgrades)).toBe(Math.round(60_000 * 0.92 ** 3));
  });
});

describe("production", () => {
  it("adds the yield of every colonised tile", () => {
    const s = game("litter");
    expect(productionRate(s)).toBe(TERRAIN_STATS.humus.yieldPerSecond);
    tileAt(s, hex(1, 0)).owned = true;
    expect(productionRate(s)).toBe(TERRAIN_STATS.humus.yieldPerSecond + TERRAIN_STATS.litter.yieldPerSecond);
  });

  it("ignores tiles that are still growing", () => {
    const s = game();
    colonize(s, hex(1, 0), T0);
    expect(productionRate(s)).toBe(TERRAIN_STATS.humus.yieldPerSecond);
  });

  it("applies Digestion accrue and Décomposeur de bois", () => {
    const up = { ...newGame(1, T0).upgrades, digestion: 2, woodDecomposer: 4 };
    expect(tileYield("humus", up)).toBeCloseTo(1 * 1.2, 10);
    expect(tileYield("deadwood", up)).toBeCloseTo(3 * 1.2 * 1.6, 10);
  });

  it("converts a share of the production into biomass", () => {
    const s = game();
    s.nutrients = 0;
    advance(s, T0 + 10_000);
    expect(s.nutrients).toBeCloseTo(10, 10);
    expect(s.biomass).toBeCloseTo(10 * ECONOMY.biomassConversionRate, 10);
    s.upgrades.biomassConversion = 5;
    expect(conversionRate(s.upgrades)).toBeCloseTo(ECONOMY.biomassConversionRate * 1.5, 10);
  });

  it("starts producing exactly when the growth ends", () => {
    const s = game("deadwood");
    colonize(s, hex(1, 0), T0);
    const end = tileAt(s, hex(1, 0)).growthEndsAt!;
    const n0 = s.nutrients;
    advance(s, end + 10_000);
    const expected = ((end - T0) / 1000) * 1 + 10 * (1 + 3);
    expect(s.nutrients - n0).toBeCloseTo(expected, 8);
    expect(tileAt(s, hex(1, 0)).growthEndsAt).toBeNull();
  });

  it("gives the same result with one big step or many ticks", () => {
    const a = game("deadwood");
    colonize(a, hex(1, 0), T0);
    const b = cloneGame(a);
    advance(a, T0 + 600_000);
    for (let t = T0; t <= T0 + 600_000; t += 5_000) advance(b, t);
    expect(b.nutrients).toBeCloseTo(a.nutrients, 6);
    expect(b.biomass).toBeCloseTo(a.biomass, 6);
  });

  it("never goes back in time", () => {
    const s = game();
    advance(s, T0 + 5_000);
    const n = s.nutrients;
    advance(s, T0);
    expect(s.nutrients).toBe(n);
    expect(s.updatedAt).toBe(T0 + 5_000);
  });
});

describe("upgrades", () => {
  it("pays and levels up", () => {
    const s = game("humus", 100);
    const cost = upgradeCost("digestion", 0);
    expect(buyUpgrade(s, "digestion")).toEqual({ ok: true });
    expect(s.upgrades.digestion).toBe(1);
    expect(s.nutrients).toBeCloseTo(100 - cost, 10);
  });

  it("refuses unknown upgrades and empty wallets", () => {
    const s = game("humus", 0);
    expect(buyUpgrade(s, "nope")).toEqual({ ok: false, error: "unknown_upgrade" });
    expect(buyUpgrade(s, "digestion")).toEqual({ ok: false, error: "not_enough_nutrients" });
    expect(s.upgrades.digestion).toBe(0);
  });
});

describe("snapshot", () => {
  it("round-trips the whole game", () => {
    const s = newGame(31337, T0);
    s.nutrients = 500;
    colonize(s, hex(0, 1), T0 + 1);
    s.upgrades.woodDecomposer = 2;
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back).toEqual(s);
  });
});
