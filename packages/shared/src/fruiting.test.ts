import { describe, expect, it } from "vitest";
import { AUTOMATION, FRUITING, SPORE_COST_GROWTH, SPORE_UPGRADES, STRUCTURES, UPGRADE_IDS, type Terrain } from "./balance";
import {
  advance,
  autoColonizeTarget,
  biomassConversion,
  build,
  buySporeUpgrade,
  checkBuySporeUpgrade,
  checkFructify,
  cloneGame,
  colonizationCost,
  conversionRate,
  fructify,
  fruitingPreview,
  goOffline,
  growthDurationMs,
  growthTimeFactor,
  mutationPoints,
  newGame,
  productionRate,
  setAutomation,
  sporeUpgradeCost,
  upgradeCost,
  type GameState,
} from "./game";
import { hex, hexDistance, hexesInRadius, hexKey, type Hex } from "./hex";
import { fromSnapshot, parseClientMessage, toSnapshot } from "./protocol";

const T0 = Date.UTC(2026, 9, 8, 8);
const HOUR = 3_600_000;

function game(terrain: Terrain = "humus"): GameState {
  const s = newGame(1, T0, 5);
  for (const t of s.tiles.values()) if (!(t.q === 0 && t.r === 0)) t.terrain = terrain;
  s.nutrients = 1e9;
  return s;
}
const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;
/** Owns every tile within `r` of the centre. */
function grow(s: GameState, r: number): void {
  for (const h of hexesInRadius(hex(0, 0), r)) tileAt(s, h).owner = s.id;
}

describe("fruiting (GDD §5)", () => {
  it("needs a connected Carpophore, a radius of 2 or more, and tiles beyond it", () => {
    const s = game();
    grow(s, 3);
    expect(checkFructify(s, 2)).toEqual({ ok: false, error: "no_carpophore" });
    build(s, hex(1, 0), "carpophore", T0);
    expect(checkFructify(s, 1)).toEqual({ ok: false, error: "invalid_radius" });
    expect(checkFructify(s, 2.5)).toEqual({ ok: false, error: "invalid_radius" });
    expect(checkFructify(s, 3)).toEqual({ ok: false, error: "nothing_to_fruit" });
    expect(checkFructify(s, 2)).toEqual({ ok: true });
  });

  it("pays floor((value / 1e4) ^ 0.6) Spores, +25 % per Carpophore", () => {
    const s = game();
    grow(s, 3);
    build(s, hex(1, 0), "carpophore", T0);
    const outer = [...s.tiles.values()].filter((t) => t.owner === s.id && hexDistance(t, hex(0, 0)) === 3);
    const value = outer.reduce((sum, t) => sum + colonizationCost(s, t), 0);
    const preview = fruitingPreview(s, 2);
    expect(preview.lost).toHaveLength(outer.length);
    expect(preview.value).toBeCloseTo(value, 4);
    expect(preview.spores).toBe(Math.floor(Math.pow(value / FRUITING.valueDivisor, FRUITING.exponent) * (1 + STRUCTURES.carpophoreSporeBonus)));
    build(s, hex(0, 1), "carpophore", T0);
    expect(fruitingPreview(s, 2).spores).toBe(
      Math.floor(Math.pow(value / FRUITING.valueDivisor, FRUITING.exponent) * (1 + 2 * STRUCTURES.carpophoreSporeBonus)),
    );
  });

  it("releases the outer tiles, keeps the biomass, and makes colonising cheap again", () => {
    const s = game();
    grow(s, 3);
    build(s, hex(1, 0), "carpophore", T0);
    build(s, hex(3, 0), "node", T0);
    s.queue.push(hex(4, 0));
    s.biomass = 5e6;
    const expected = fruitingPreview(s, 2).spores;
    const costBefore = colonizationCost(s, tileAt(s, hex(4, 0)));
    expect(fructify(s, 2, T0).ok).toBe(true);
    expect(s.spores).toBe(expected);
    expect(s.fruitings).toBe(1);
    expect(s.biomass).toBe(5e6);
    expect(s.queue).toEqual([]);
    const outer = tileAt(s, hex(3, 0));
    expect(outer.owner).toBeNull();
    expect(outer.structure).toBeNull();
    expect([...s.tiles.values()].filter((t) => t.owner === s.id)).toHaveLength(19);
    expect(colonizationCost(s, tileAt(s, hex(3, 0)))).toBeLessThan(costBefore / 5);
  });
});

describe("Spore shop (GDD §5)", () => {
  it("prices at base × 1.5^level and needs the Spores", () => {
    const s = game();
    expect(checkBuySporeUpgrade(s, "wings")).toEqual({ ok: false, error: "unknown_spore_upgrade" });
    expect(checkBuySporeUpgrade(s, "production")).toEqual({ ok: false, error: "not_enough_spores" });
    s.spores = 100;
    expect(buySporeUpgrade(s, "production").ok).toBe(true);
    expect(s.spores).toBe(100 - SPORE_UPGRADES.production.baseCost);
    expect(sporeUpgradeCost("production", 1)).toBe(SPORE_UPGRADES.production.baseCost * SPORE_COST_GROWTH);
  });

  it("gives production, growth, conversion and mutation points for the week", () => {
    const s = game();
    grow(s, 1);
    const base = { prod: productionRate(s), conv: biomassConversion(s), points: mutationPoints(s), growth: growthTimeFactor(s, T0) };
    s.sporeUpgrades = { production: 2, growth: 1, conversion: 3, mutationPoint: 1 };
    expect(productionRate(s)).toBeCloseTo(base.prod * (1 + 2 * SPORE_UPGRADES.production.perLevel), 10);
    expect(biomassConversion(s)).toBeCloseTo(conversionRate(s.upgrades) * 1.15, 12);
    expect(base.conv).toBe(conversionRate(s.upgrades));
    expect(mutationPoints(s)).toBe(base.points + 1);
    expect(growthTimeFactor(s, T0)).toBeCloseTo(base.growth * 0.9, 12);
  });
});

describe("automations (GDD §9)", () => {
  it("unlock with biomass", () => {
    const s = game();
    expect(setAutomation(s, { colonize: "any" }, T0)).toEqual({ ok: false, error: "locked" });
    expect(setAutomation(s, { colonize: "lava" as Terrain }, T0)).toEqual({ ok: false, error: "invalid_automation" });
    s.biomass = AUTOMATION.colonizeAt;
    expect(setAutomation(s, { colonize: "litter" }, T0).ok).toBe(true);
    expect(setAutomation(s, { upgrades: true }, T0)).toEqual({ ok: false, error: "locked" });
    s.biomass = AUTOMATION.upgradesAt;
    expect(setAutomation(s, { upgrades: true }, T0).ok).toBe(true);
    expect(setAutomation(s, { colonize: null, upgrades: false }, T0).ok).toBe(true);
    expect(s.automation).toEqual({ colonize: null, upgrades: false });
  });

  it("auto-colonisation plans the cheapest tile, preferred terrain first, and keeps going offline", () => {
    const s = game();
    s.biomass = AUTOMATION.colonizeAt;
    tileAt(s, hex(-1, 1)).terrain = "litter";
    s.automation.colonize = "litter";
    expect(autoColonizeTarget(s, T0)).toMatchObject({ q: -1, r: 1 });
    s.automation.colonize = "any";
    const target = autoColonizeTarget(s, T0)!;
    for (const h of hexesInRadius(hex(0, 0), 1)) {
      const t = tileAt(s, h);
      if (t.owner === null) expect(colonizationCost(s, target)).toBeLessThanOrEqual(colonizationCost(s, t));
    }
    goOffline(s, T0);
    advance(s, T0 + 2 * HOUR);
    expect([...s.tiles.values()].filter((t) => t.owner === s.id).length).toBeGreaterThan(20);
  });

  it("auto-reinvestment buys the cheapest upgrades but keeps what the next tile costs", () => {
    const s = game();
    s.biomass = AUTOMATION.upgradesAt;
    s.automation.upgrades = true;
    s.queue.push(hex(1, 0));
    s.nutrients = 0;
    // Nothing grows and the queue waits: fill the purse right above the next tile's cost.
    const tileCost = colonizationCost(s, tileAt(s, hex(1, 0)));
    const cheapest = Math.min(...UPGRADE_IDS.map((id) => upgradeCost(id, 0)));
    s.nutrients = tileCost - 1;
    advance(s, T0 + 5_000);
    expect(Object.values(s.upgrades).every((l) => l === 0)).toBe(true);
    s.queue = [];
    s.nutrients = cheapest + 10;
    advance(s, T0 + 10_000);
    expect(Object.values(s.upgrades).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("gives the same game whatever the step", () => {
    const a = game();
    a.nutrients = 50_000;
    a.biomass = AUTOMATION.upgradesAt;
    a.automation = { colonize: "any", upgrades: true };
    goOffline(a, T0);
    const b = cloneGame(a);
    advance(a, T0 + 6 * HOUR);
    for (let t = T0; t <= T0 + 6 * HOUR; t += 7 * 60_000 + 13) advance(b, t);
    advance(b, T0 + 6 * HOUR);
    expect(b.upgrades).toEqual(a.upgrades);
    expect([...b.tiles.values()].filter((t) => t.owner === b.id).length).toBe([...a.tiles.values()].filter((t) => t.owner === a.id).length);
    expect(b.nutrients / a.nutrients).toBeCloseTo(1, 4);
  });
});

describe("on the wire", () => {
  it("carries Spores, the shop, fruitings and automations", () => {
    const s = game();
    s.spores = 12;
    s.sporeUpgrades.growth = 2;
    s.fruitings = 1;
    s.automation = { colonize: "humus", upgrades: true };
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.spores).toBe(12);
    expect(back.sporeUpgrades.growth).toBe(2);
    expect(back.fruitings).toBe(1);
    expect(back.automation).toEqual({ colonize: "humus", upgrades: true });
    expect(parseClientMessage('{"type":"fructify","radius":3}')).toEqual({ type: "fructify", radius: 3 });
    expect(parseClientMessage('{"type":"fructify","radius":"3"}')).toBeNull();
    expect(parseClientMessage('{"type":"buySporeUpgrade","upgrade":"growth"}')).toEqual({ type: "buySporeUpgrade", upgrade: "growth" });
    expect(parseClientMessage('{"type":"setAutomation","colonize":null,"upgrades":true}')).toEqual({ type: "setAutomation", colonize: null, upgrades: true });
    expect(parseClientMessage('{"type":"setAutomation","upgrades":"yes"}')).toBeNull();
    expect(growthDurationMs("humus", s.upgrades)).toBeGreaterThan(0);
  });
});
