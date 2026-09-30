import { describe, expect, it } from "vitest";
import { ACID, BORDERS, EXHAUSTION, MUTATIONS, ROOTS, STRAINS, TERRAIN_STATS, TRANSPORT, type Terrain } from "./balance";
import { joinForest, newForest, pressure, refreshReservations, refreshToxins, resolveBorders, visibleKeys, type ForestState } from "./forest";
import {
  advance,
  build,
  checkChooseStrain,
  checkColonize,
  checkMutate,
  chooseStrain,
  colonizationCost,
  colonize,
  earnedMutationPoints,
  goOffline,
  growthDurationMs,
  lifetimeMs,
  mutate,
  mutationPoints,
  mutationThreshold,
  newGame,
  offlineFactor,
  productionRate,
  tileProduction,
  type GameState,
} from "./game";
import { hex, hexesInRadius, hexKey, type Hex } from "./hex";
import { fromSnapshot, parseClientMessage, toSnapshot } from "./protocol";

const T0 = Date.UTC(2026, 9, 8, 8); // A Thursday.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function game(terrain: Terrain = "humus"): GameState {
  const s = newGame(1, T0, 4);
  for (const t of s.tiles.values()) if (!(t.q === 0 && t.r === 0)) t.terrain = terrain;
  s.nutrients = 1e9;
  return s;
}
const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;
const own = (s: GameState, ...hexes: Hex[]) => hexes.forEach((h) => (tileAt(s, h).owner = s.id));
/** Gives the mutations directly (their points are tested separately). */
const give = (s: GameState, ...ids: GameState["mutations"]) => s.mutations.push(...ids);

describe("mutation points (GDD §4.2)", () => {
  it("come at 20 k, 60 k, 180 k… biomass", () => {
    expect(mutationThreshold(1)).toBe(20_000);
    expect(mutationThreshold(2)).toBe(60_000);
    expect(mutationThreshold(3)).toBe(180_000);
    expect(earnedMutationPoints(19_999)).toBe(0);
    expect(earnedMutationPoints(20_000)).toBe(1);
    expect(earnedMutationPoints(179_999)).toBe(2);
    expect(earnedMutationPoints(2e8)).toBe(9);
  });

  it("buy mutations in branch order, one point each, for good", () => {
    const s = game();
    expect(checkMutate(s, "digestiveEnzymes")).toEqual({ ok: false, error: "no_mutation_point" });
    s.biomass = 60_000;
    expect(mutationPoints(s)).toBe(2);
    expect(checkMutate(s, "wings")).toEqual({ ok: false, error: "unknown_mutation" });
    expect(checkMutate(s, "slowWear")).toEqual({ ok: false, error: "mutation_locked" });
    expect(mutate(s, "digestiveEnzymes", T0).ok).toBe(true);
    expect(checkMutate(s, "digestiveEnzymes")).toEqual({ ok: false, error: "already_mutated" });
    expect(mutate(s, "mycorrhiza", T0).ok).toBe(true);
    expect(mutationPoints(s)).toBe(0);
    expect(checkMutate(s, "slowWear")).toEqual({ ok: false, error: "no_mutation_point" });
    expect(s.mutations).toEqual(["digestiveEnzymes", "mycorrhiza"]);
  });
});

describe("Décomposeur", () => {
  it("Enzymes digestives: production +15 %", () => {
    const s = game();
    own(s, hex(1, 0));
    const before = productionRate(s);
    give(s, "digestiveEnzymes");
    expect(productionRate(s)).toBeCloseTo(before * (1 + MUTATIONS.digestiveEnzymes), 10);
  });

  it("Usure lente: wear stops counting at 25 %", () => {
    const s = game();
    own(s, hex(1, 0));
    const tile = tileAt(s, hex(1, 0));
    tile.exhaustion = EXHAUSTION.max;
    const worn = tileProduction(s, tile);
    give(s, "slowWear");
    expect(tileProduction(s, tile)).toBeCloseTo((worn / (1 - EXHAUSTION.max)) * (1 - MUTATIONS.slowWearCap), 10);
    // Integrated from fresh: the same as stepping in small increments.
    const a = game();
    const b = game();
    for (const g of [a, b]) {
      own(g, hex(1, 0));
      give(g, "slowWear");
      g.nutrients = 0;
    }
    advance(a, T0 + 12 * HOUR);
    for (let t = T0; t <= T0 + 12 * HOUR; t += 10 * 60_000) advance(b, t);
    expect(b.nutrients).toBeCloseTo(a.nutrients, 4);
    // Past the cap, a Humus tile at 1 hop yields 75 % of its fresh value.
    const perHour = TERRAIN_STATS.humus.yieldPerSecond * 3600;
    const heart = perHour;
    const far = perHour * (1 - TRANSPORT.lossPerHop);
    const c = game();
    own(c, hex(1, 0));
    give(c, "slowWear");
    for (const t of c.tiles.values()) t.exhaustion = EXHAUSTION.max;
    c.nutrients = 0;
    advance(c, T0 + HOUR);
    expect(c.nutrients).toBeCloseTo((heart + far) * (1 - MUTATIONS.slowWearCap), 6);
  });

  it("Saprophyte: Dead wood and Stumps +50 %", () => {
    const s = game("deadwood");
    own(s, hex(1, 0));
    tileAt(s, hex(0, 1)).terrain = "stump";
    own(s, hex(0, 1));
    const wood = tileProduction(s, tileAt(s, hex(1, 0)));
    const stump = tileProduction(s, tileAt(s, hex(0, 1)));
    give(s, "saprophyte");
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo(wood * 1.5, 10);
    expect(tileProduction(s, tileAt(s, hex(0, 1)))).toBeCloseTo(stump * 1.5, 10);
  });

  it("Acidophile: Acid soil lasts twice as long", () => {
    const s = game("acid");
    own(s, hex(1, 0));
    const before = lifetimeMs(s, tileAt(s, hex(1, 0)));
    give(s, "acidophile");
    expect(lifetimeMs(s, tileAt(s, hex(1, 0)))).toBe(before * ACID.acidophileLifetimeFactor);
  });

  it("Dormance: offline ×1.5, online ×0.8", () => {
    const s = game();
    give(s, "dormancy");
    expect(offlineFactor(s, T0)).toBe(MUTATIONS.dormancyOnline);
    goOffline(s, T0);
    expect(offlineFactor(s, T0 + HOUR)).toBe(MUTATIONS.dormancyOffline);
    expect(offlineFactor(s, T0 + 9 * HOUR)).toBeCloseTo(MUTATIONS.dormancyOffline * 0.25, 10);
  });
});

/** Two players face to face on one border tile (1,0), owned by b. */
function duel(): { f: ForestState; a: GameState; b: GameState; border: Hex } {
  const f = newForest(11, T0 - 2 * DAY, 4, { calendar: false });
  for (const t of f.tiles.values()) t.terrain = "humus";
  const a = joinForest(f, "a", T0 - 2 * DAY)!;
  const b = joinForest(f, "b", T0 - 2 * DAY)!;
  for (const t of f.tiles.values()) t.owner = null;
  a.heart = hex(-2, 0);
  for (const h of [...hexesInRadius(a.heart, 2), hex(0, 1), hex(1, -1)]) f.tiles.get(hexKey(h))!.owner = "a";
  b.heart = hex(3, 0);
  for (const h of [hex(3, 0), hex(2, 0), hex(1, 0)]) f.tiles.get(hexKey(h))!.owner = "b";
  for (const p of [a, b]) {
    p.lastSeenAt = null;
    p.updatedAt = T0;
    p.nutrients = 1e9;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}

function timeToTake(f: ForestState, border: Hex): number {
  const tile = f.tiles.get(hexKey(border))!;
  for (let t = T0 + 5_000; t <= T0 + 12 * HOUR; t += 5_000) {
    resolveBorders(f, 5_000, t);
    if (tile.owner === "a") return t - T0;
  }
  return Infinity;
}

describe("Parasite", () => {
  it("Hyphes agressives: pressure +25 %", () => {
    const { f, a, border } = duel();
    const before = pressure(f, "a", border);
    give(a, "aggressiveHyphae");
    expect(pressure(f, "a", border)).toBeCloseTo(before * (1 + MUTATIONS.aggressiveHyphae), 10);
  });

  it("Pillage: conquest bonus ×2; Cordyceps: the structure is kept", () => {
    const plain = duel();
    timeToTake(plain.f, plain.border);
    const looted = duel();
    give(looted.a, "plunder", "cordyceps");
    build(looted.b, looted.border, "node", T0);
    timeToTake(looted.f, looted.border);
    expect(looted.a.biomass).toBeCloseTo(plain.a.biomass * MUTATIONS.plunder, 6);
    expect(looted.f.tiles.get(hexKey(looted.border))!.structure).toBe("node");
  });

  it("Toxines: enemy tiles touching yours produce 15 % less", () => {
    const { f, a, b } = duel();
    const tile = f.tiles.get(hexKey(hex(2, 0)))!; // b's, next to the border tile only.
    const border = f.tiles.get(hexKey(hex(1, 0)))!; // b's, touching a.
    const before = tileProduction(b, border);
    give(a, "toxins");
    refreshToxins(f);
    expect(border.toxic).toBe(true);
    expect(tile.toxic).toBe(false);
    expect(tileProduction(b, border)).toBeCloseTo(before * (1 - MUTATIONS.toxins), 10);
  });

  it("Témérité: +3 % per border tile, up to +30 %", () => {
    const { a } = duel();
    const before = productionRate(a);
    give(a, "temerity");
    // a touches b with (0,1)? No: (0,1) and (1,-1) and (0,0) touch (1,0).
    const border = [hex(0, 0), hex(0, 1), hex(1, -1)].length;
    expect(productionRate(a)).toBeCloseTo(before * (1 + MUTATIONS.temerityPerTile * border), 8);
  });
});

describe("Symbiote", () => {
  it("Mycorhize: Roots ×2", () => {
    const s = game("roots");
    own(s, hex(1, 0));
    const tile = tileAt(s, hex(1, 0));
    const before = tileProduction(s, tile);
    give(s, "mycorrhiza");
    const bonusBefore = 1 + ROOTS.networkBonus;
    const bonusAfter = 1 + ROOTS.networkBonus * 2;
    expect(tileProduction(s, tile)).toBeCloseTo((before / bonusBefore) * 2 * bonusAfter, 10);
  });

  it("Cordons mycéliens: transport loss −50 %", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    give(s, "mycelialCords");
    expect(tileProduction(s, tileAt(s, hex(2, 0)))).toBeCloseTo(TERRAIN_STATS.humus.yieldPerSecond * (1 - TRANSPORT.lossPerHop), 10);
  });

  it("Résilience: your tiles are taken 25 % slower", () => {
    const { f, b, border } = duel();
    give(b, "resilience");
    expect(timeToTake(f, border)).toBeCloseTo(BORDERS.captureMs.humus / MUTATIONS.resilience, -4);
  });

  it("Bioluminescence: enemy networks seen 3 tiles away", () => {
    const { f, a } = duel();
    expect(visibleKeys(f, "a").has(hexKey(hex(3, 0)))).toBe(false);
    give(a, "bioluminescence");
    const seen = visibleKeys(f, "a");
    expect(seen.has(hexKey(hex(3, 0)))).toBe(true);
    // Wild tiles out there stay in the fog.
    expect(seen.has(hexKey(hex(3, -2)))).toBe(false);
  });

  it("Hyphes aquatiques: wetlands can be colonised", () => {
    const s = game("wetland");
    expect(checkColonize(s, hex(1, 0))).toEqual({ ok: false, error: "impassable" });
    give(s, "aquaticHyphae");
    expect(colonize(s, hex(1, 0), T0).ok).toBe(true);
    advance(s, T0 + HOUR);
    expect(tileAt(s, hex(1, 0)).owner).toBe(s.id);
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeGreaterThan(0);
  });
});

describe("strains (GDD §4.3)", () => {
  it("are chosen once, before the first new tile", () => {
    const s = game();
    expect(checkChooseStrain(s, "amanita")).toEqual({ ok: false, error: "unknown_strain" });
    expect(chooseStrain(s, "truffle").ok).toBe(true);
    expect(checkChooseStrain(s, "pleurotus")).toEqual({ ok: false, error: "strain_chosen" });
    const late = game();
    own(late, hex(1, 0));
    expect(checkChooseStrain(late, "pleurotus")).toEqual({ ok: false, error: "strain_chosen" });
  });

  it("Pleurote: grows −30 %, colonises −10 %, is taken 25 % faster", () => {
    const s = game();
    const cost = colonizationCost(s, tileAt(s, hex(1, 0)));
    chooseStrain(s, "pleurotus");
    expect(colonizationCost(s, tileAt(s, hex(1, 0)))).toBeCloseTo(cost * STRAINS.pleurotus.colonizationCost, 8);
    colonize(s, hex(1, 0), T0);
    expect(tileAt(s, hex(1, 0)).growthEndsAt! - T0).toBe(growthDurationMs("humus", s.upgrades, STRAINS.pleurotus.growthTime));
    const { f, b, border } = duel();
    b.strain = "pleurotus";
    expect(timeToTake(f, border)).toBeCloseTo(BORDERS.captureMs.humus / STRAINS.pleurotus.capturedSpeed, -4);
  });

  it("Armillaire: ×0.85 on Monday up to ×1.15 on Sunday", () => {
    const f = newForest(5, Date.UTC(2026, 9, 5, 8), 4);
    const p = joinForest(f, "p", Date.UTC(2026, 9, 5, 8))!;
    const monday = productionRate(p, Date.UTC(2026, 9, 5, 9));
    const sunday = productionRate(p, Date.UTC(2026, 9, 11, 9));
    chooseStrain(p, "armillaria");
    expect(productionRate(p, Date.UTC(2026, 9, 5, 9))).toBeCloseTo(monday * 0.85, 10);
    expect(productionRate(p, Date.UTC(2026, 9, 11, 9))).toBeCloseTo(sunday * 1.15, 10);
  });

  it("Cordyceps: pressure +20 %, production −10 %", () => {
    const { f, a, border } = duel();
    const p = pressure(f, "a", border);
    const prod = productionRate(a);
    a.strain = "cordyceps";
    expect(pressure(f, "a", border)).toBeCloseTo(p * STRAINS.cordyceps.pressure, 10);
    expect(productionRate(a)).toBeCloseTo(prod * STRAINS.cordyceps.production, 10);
  });

  it("Truffe: hidden from far sight, Roots +50 %", () => {
    const { f, a, b } = duel();
    give(a, "bioluminescence");
    b.strain = "truffle";
    const seen = visibleKeys(f, "a");
    expect(seen.has(hexKey(hex(1, 0)))).toBe(true); // Touches a.
    expect(seen.has(hexKey(hex(3, 0)))).toBe(false);
    const s = game("roots");
    own(s, hex(1, 0));
    const before = tileProduction(s, tileAt(s, hex(1, 0)));
    s.strain = "truffle";
    const ratio = (1.5 * (1 + ROOTS.networkBonus * 1.5)) / (1 + ROOTS.networkBonus);
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo(before * ratio, 10);
  });
});

describe("on the wire", () => {
  it("carries the strain, the mutations and the toxins", () => {
    const { f, a, b } = duel();
    give(a, "aggressiveHyphae", "plunder", "toxins");
    b.strain = "armillaria";
    refreshToxins(f);
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(b))));
    expect(back.strain).toBe("armillaria");
    expect(back.tiles.get(hexKey(hex(1, 0)))!.toxic).toBe(true);
    expect(fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(a)))).mutations).toEqual(["aggressiveHyphae", "plunder", "toxins"]);
    expect(parseClientMessage('{"type":"mutate","mutation":"plunder"}')).toEqual({ type: "mutate", mutation: "plunder" });
    expect(parseClientMessage('{"type":"chooseStrain","strain":"truffle"}')).toEqual({ type: "chooseStrain", strain: "truffle" });
  });
});
