import { describe, expect, it } from "vitest";
import { BUDS, COHESION, ECONOMY, ENRICH, FRUITING, TERRAIN_STATS, type Terrain } from "./balance";
import { cohesionDefence, joinForest, newForest, refreshReservations, resolveBorders, type ForestState } from "./forest";
import {
  advance,
  affordableLevels,
  autoEnrichTarget,
  biomassConversion,
  build,
  cohesion,
  enrich,
  enrichBlock,
  enrichCost,
  enrichFactor,
  enrichSpent,
  fruitingPreview,
  isRosette,
  milestonesReached,
  newGame,
  nextMilestone,
  pickBud,
  productionRate,
  refreshBuds,
  SOLO_PLAYER,
  tileProduction,
  type GameState,
} from "./game";
import { hex, hexesInRadius, hexKey, hexNeighbors, type Hex } from "./hex";
import { fromSnapshot, parseClientMessage, toSnapshot } from "./protocol";

const T0 = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;
const RICH = 10_000_000;

function game(terrain: Terrain = "humus", nutrients = RICH): GameState {
  const state = newGame(1, T0, 4);
  for (const t of state.tiles.values()) if (!(t.q === 0 && t.r === 0)) t.terrain = terrain;
  state.nutrients = nutrients;
  return state;
}
const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;
function own(s: GameState, ...hexes: Hex[]): void {
  for (const h of hexes) tileAt(s, h).owner = SOLO_PLAYER;
}

describe("enrichment levels (GDD §4.4)", () => {
  it("adds 8 % per level and doubles at every milestone", () => {
    expect(enrichFactor(0)).toBe(1);
    expect(enrichFactor(1)).toBeCloseTo(1.08, 10);
    expect(enrichFactor(9)).toBeCloseTo(1.72, 10);
    expect(enrichFactor(10)).toBeCloseTo(1.8 * 2, 10);
    expect(enrichFactor(25)).toBeCloseTo(3 * 4, 10);
    expect(milestonesReached(100)).toBe(4);
    expect(milestonesReached(199)).toBe(4);
    expect(milestonesReached(200)).toBe(5);
    expect(nextMilestone(0)).toBe(10);
    expect(nextMilestone(10)).toBe(25);
    expect(nextMilestone(100)).toBe(200);
    // On a Rosace, the bonus of the levels counts 10 % more.
    expect(enrichFactor(10, true)).toBeCloseTo(1 + 2.6 * (1 + COHESION.rosetteEnrich), 10);
  });

  it("costs `base_case × 1.12 ^ level`, base_case being a share of the tile's price at the colony's size", () => {
    const s = game();
    own(s, hex(1, 0));
    const t = tileAt(s, hex(1, 0));
    const base = TERRAIN_STATS.humus.baseCost * ECONOMY.sizeFactor ** 2 * ENRICH.baseShare;
    expect(enrichCost(s, t)).toBeCloseTo(base, 10);
    t.level = 3;
    expect(enrichCost(s, t)).toBeCloseTo(base * 1.12 ** 3, 8);
    expect(enrichCost(s, t, 2)).toBeCloseTo(base * (1.12 ** 3 + 1.12 ** 4), 8);
    expect(enrichSpent(s, t)).toBeCloseTo(base * (1 + 1.12 + 1.12 ** 2), 8);
  });

  it("multiplies the tile's production", () => {
    const s = game();
    own(s, hex(1, 0));
    const t = tileAt(s, hex(1, 0));
    const before = tileProduction(s, t);
    t.level = 10;
    expect(tileProduction(s, t)).toBeCloseTo(before * enrichFactor(10), 10);
  });

  it("buys ×1, ×10 or as many as the nutrients pay for", () => {
    const s = game("humus", 0);
    own(s, hex(1, 0));
    const t = tileAt(s, hex(1, 0));
    expect(enrich(s, hex(1, 0), 1)).toEqual({ ok: false, error: "not_enough_nutrients" });
    s.nutrients = enrichCost(s, t, 12) + 1;
    expect(enrich(s, hex(1, 0), 1)).toEqual({ ok: true });
    expect(t.level).toBe(1);
    expect(enrich(s, hex(1, 0), 10)).toEqual({ ok: true });
    expect(t.level).toBe(11);
    // Only one more level is paid for: "×10" buys what it can.
    expect(enrich(s, hex(1, 0), 10)).toEqual({ ok: true });
    expect(t.level).toBe(12);
    expect(s.nutrients).toBeCloseTo(1, 6);
    s.nutrients = enrichCost(s, t, 7) + (enrichCost(s, t, 8) - enrichCost(s, t, 7)) / 2;
    expect(affordableLevels(s, t)).toBe(7);
    expect(enrich(s, hex(1, 0), "max")).toEqual({ ok: true });
    expect(t.level).toBe(19);
    expect(enrich(s, hex(1, 0), 0)).toEqual({ ok: false, error: "invalid_count" });
  });

  it("only on the player's own grown, connected, productive tiles", () => {
    const s = game("rock");
    own(s, hex(1, 0));
    expect(enrich(s, hex(2, 0), 1)).toEqual({ ok: false, error: "not_connected" });
    expect(enrich(s, hex(1, 0), 1)).toEqual({ ok: false, error: "not_productive" });
    const g = game();
    own(g, hex(1, 0));
    tileAt(g, hex(1, 0)).growthEndsAt = T0 + MIN;
    expect(enrich(g, hex(1, 0), 1)).toEqual({ ok: false, error: "not_connected" });
  });

  it("enriches a whole block: one level on the tile and on each of its neighbours of the colony", () => {
    const s = game();
    own(s, hex(1, 0), hex(1, -1), hex(2, -1));
    tileAt(s, hex(1, -1)).level = 5; // The dearest one.
    // Nutrients for all but the dearest level.
    s.nutrients = enrichCost(s, tileAt(s, hex(0, 0))) + enrichCost(s, tileAt(s, hex(1, 0))) + enrichCost(s, tileAt(s, hex(2, -1))) + 1;
    expect(enrichBlock(s, hex(1, 0))).toEqual({ ok: true });
    expect([hex(0, 0), hex(1, 0), hex(2, -1), hex(1, -1)].map((h) => tileAt(s, h).level)).toEqual([1, 1, 1, 5]);
    s.nutrients = 0;
    expect(enrichBlock(s, hex(1, 0))).toEqual({ ok: false, error: "not_enough_nutrients" });
  });

  it("counts what the levels cost in the value of a fruiting", () => {
    const s = game();
    own(s, ...hexesInRadius(hex(0, 0), 3));
    build(s, hex(0, 0), "carpophore", T0);
    const plain = fruitingPreview(s, 2).value;
    const far = tileAt(s, hex(3, 0));
    far.level = 10;
    expect(fruitingPreview(s, 2).value).toBeCloseTo(plain + enrichSpent(s, far) * FRUITING.enrichWeight, 6);
  });

  it("auto-reinvestment enriches at most one tile a minute", () => {
    const s = game("humus");
    own(s, hex(1, 0), hex(2, 0));
    s.biomass = 10_000_000; // Automations unlocked.
    s.automation.upgrades = true;
    expect(autoEnrichTarget(s, T0)).not.toBeNull();
    advance(s, T0 + 10 * MIN);
    const levels = [...s.tiles.values()].reduce((n, t) => n + t.level, 0);
    expect(levels).toBe(10);
  });
});

describe("cohesion (GDD §2.3)", () => {
  it("adds 5 % of production per neighbour of the same colony", () => {
    const s = game();
    own(s, hex(1, 0));
    const t = tileAt(s, hex(1, 0));
    expect(cohesion(s.tiles, t)).toBe(1);
    const one = tileProduction(s, t);
    own(s, hex(2, 0), hex(2, -1));
    expect(cohesion(s.tiles, t)).toBe(3);
    expect(tileProduction(s, t)).toBeCloseTo((one / 1.05) * 1.15, 10);
    // Growing neighbours do not count yet.
    tileAt(s, hex(2, 0)).growthEndsAt = T0 + MIN;
    expect(cohesion(s.tiles, t)).toBe(2);
  });

  it("a Rosace has all six neighbours", () => {
    const s = game();
    own(s, ...hexNeighbors(hex(0, 0)));
    expect(isRosette(s.tiles, tileAt(s, hex(0, 0)))).toBe(true);
    expect(isRosette(s.tiles, tileAt(s, hex(1, 0)))).toBe(false);
  });
});

/** `a` around (-2,0) faces `b` on the border tile (1,0), as in conflict.test.ts. */
function arena(): { f: ForestState; a: GameState; b: GameState; border: Hex } {
  const f = newForest(11, T0 - 2 * DAY, 4, { calendar: false });
  for (const t of f.tiles.values()) t.terrain = "humus";
  const a = joinForest(f, "a", T0 - 2 * DAY)!;
  const b = joinForest(f, "b", T0 - 2 * DAY)!;
  for (const t of f.tiles.values()) t.owner = null;
  a.heart = hex(-2, 0);
  for (const h of [...hexesInRadius(a.heart, 2), hex(0, 1), hex(1, -1)]) f.tiles.get(hexKey(h))!.owner = "a";
  b.heart = hex(3, 0);
  for (const h of [hex(3, 0), hex(2, 0), hex(1, 0), hex(4, 0), hex(5, 0), hex(4, -1), hex(5, -1), hex(6, -1)]) f.tiles.get(hexKey(h))!.owner = "b";
  for (const p of [a, b]) {
    p.lastSeenAt = null;
    p.updatedAt = T0;
    p.nutrients = RICH;
    p.enzymesUnlocked = true;
    p.enzymes = 1_000;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}

function timeToTake(f: ForestState, h: Hex): number {
  const tile = f.tiles.get(hexKey(h))!;
  const before = tile.owner;
  for (let t = T0 + 5_000; t <= T0 + 24 * HOUR; t += 5_000) {
    resolveBorders(f, 5_000, t);
    if (tile.owner !== before) return t - T0;
  }
  return Infinity;
}

describe("cohesion in defence (GDD §2.3, §6.1)", () => {
  it("weakens the attack by 8 % and slows the capture by 15 % per neighbour", () => {
    const { f, border } = arena();
    const tile = f.tiles.get(hexKey(border))!;
    expect(cohesionDefence(f, tile)).toEqual({ neighbours: 1, pushBack: 1 - COHESION.pressure, hold: 1 + COHESION.captureTime });
    const lone = timeToTake(f, border);
    // The same fight with one more tile of b touching the border tile.
    const g = arena();
    g.f.tiles.get(hexKey(hex(2, -1)))!.owner = "b";
    const tile2 = g.f.tiles.get(hexKey(border))!;
    expect(cohesionDefence(g.f, tile2).hold).toBeCloseTo(1 + 2 * COHESION.captureTime, 10);
    // At least 15 % / 115 % longer from the hold alone, more with the weaker attack.
    expect(timeToTake(g.f, border)).toBeGreaterThanOrEqual(lone * ((1 + 2 * COHESION.captureTime) / (1 + COHESION.captureTime)) - 5_000);
  });

  it("a captured tile keeps half of its levels", () => {
    const { f, border } = arena();
    f.tiles.get(hexKey(border))!.level = 21;
    expect(timeToTake(f, border)).toBeLessThan(Infinity);
    expect(f.tiles.get(hexKey(border))!.level).toBe(10);
  });
});

describe("buds (GDD §4.4)", () => {
  it("grow every 2 to 4 minutes, fade after 5, and pay 18 s of production", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    s.nutrients = 0;
    refreshBuds(s, T0);
    expect(s.buds).toEqual([]);
    const first = s.nextBudAt!;
    expect(first - T0).toBeGreaterThanOrEqual(BUDS.minEveryMs);
    expect(first - T0).toBeLessThanOrEqual(BUDS.maxEveryMs);
    advance(s, first);
    refreshBuds(s, first);
    expect(s.buds).toHaveLength(1);
    expect(s.buds[0]!.until).toBe(first + BUDS.lifeMs);
    const bud = { q: s.buds[0]!.q, r: s.buds[0]!.r };
    expect(pickBud(s, hex(4, 0), first)).toEqual({ ok: false, error: "no_bud" });
    const rate = productionRate(s, first);
    const before = { n: s.nutrients, b: s.biomass };
    expect(pickBud(s, bud, first)).toEqual({ ok: true });
    expect(s.nutrients - before.n).toBeCloseTo(rate * BUDS.rewardSeconds, 6);
    expect(s.biomass - before.b).toBeCloseTo(rate * BUDS.rewardSeconds * biomassConversion(s), 6);
    expect(s.buds).toEqual([]);
    expect(pickBud(s, bud, first)).toEqual({ ok: false, error: "no_bud" });
  });

  it("do not depend on how often they are refreshed, and fade while nobody picks them", () => {
    const a = game();
    const b = game();
    for (const g of [a, b]) own(g, hex(1, 0), hex(2, 0), hex(0, 1));
    refreshBuds(a, T0 + 2 * HOUR);
    for (let t = T0; t <= T0 + 2 * HOUR; t += 7_000) refreshBuds(b, t);
    refreshBuds(b, T0 + 2 * HOUR);
    expect(a.nextBudAt).toBe(b.nextBudAt);
    expect(a.buds).toEqual(b.buds);
    expect(a.buds.length).toBeLessThanOrEqual(BUDS.max);
    for (const bud of a.buds) expect(bud.until).toBeGreaterThan(T0 + 2 * HOUR);
  });
});

describe("M8 on the wire", () => {
  it("carries levels and buds", () => {
    const s = game();
    own(s, hex(1, 0));
    tileAt(s, hex(1, 0)).level = 7;
    s.buds = [{ q: 1, r: 0, until: T0 + MIN }];
    s.nextBudAt = T0 + 2 * MIN;
    const back = fromSnapshot(toSnapshot(s));
    expect(tileAt(back, hex(1, 0)).level).toBe(7);
    expect(tileAt(back, hex(0, 0)).level).toBe(0);
    expect(back.buds).toEqual(s.buds);
    expect(back.nextBudAt).toBe(T0 + 2 * MIN);
  });

  it("parses the new messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "enrich", q: 1, r: 0, count: 10 }))).toEqual({ type: "enrich", q: 1, r: 0, count: 10 });
    expect(parseClientMessage(JSON.stringify({ type: "enrich", q: 1, r: 0, count: "max" }))).toEqual({ type: "enrich", q: 1, r: 0, count: "max" });
    expect(parseClientMessage(JSON.stringify({ type: "enrich", q: 1, r: 0, count: 0 }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "enrichBlock", q: 1, r: 0 }))).toEqual({ type: "enrichBlock", q: 1, r: 0 });
    expect(parseClientMessage(JSON.stringify({ type: "pickBud", q: 1, r: 0 }))).toEqual({ type: "pickBud", q: 1, r: 0 });
  });
});
