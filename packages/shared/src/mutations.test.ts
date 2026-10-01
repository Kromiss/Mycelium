import { describe, expect, it } from "vitest";
import { COHESION, MUTATIONS, ROOTS, STRAINS, TERRAIN_STATS, TRANSPORT, type Terrain } from "./balance";
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
  enrichCost,
  goOffline,
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
import { plainCaptureMs } from "./testing";

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
    expect(checkMutate(s, "deepDigestion")).toEqual({ ok: false, error: "mutation_locked" });
    expect(mutate(s, "digestiveEnzymes", T0).ok).toBe(true);
    expect(checkMutate(s, "digestiveEnzymes")).toEqual({ ok: false, error: "already_mutated" });
    expect(mutate(s, "mycorrhiza", T0).ok).toBe(true);
    expect(mutationPoints(s)).toBe(0);
    expect(checkMutate(s, "deepDigestion")).toEqual({ ok: false, error: "no_mutation_point" });
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

  it("Digestion profonde (M9): Enrichissement 15 % cheaper", () => {
    const s = game();
    own(s, hex(1, 0));
    const tile = tileAt(s, hex(1, 0));
    const before = enrichCost(s, tile, 10);
    give(s, "deepDigestion");
    expect(enrichCost(s, tile, 10)).toBeCloseTo(before * (1 - MUTATIONS.deepDigestion), 6);
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

  it("Mycélium dense (M9): cohesion +7.5 % per neighbour instead of +5 %", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0), hex(1, 1));
    const tile = tileAt(s, hex(1, 0)); // Three neighbours of its colony: the Cœur, (2,0) and (1,1).
    const before = tileProduction(s, tile);
    give(s, "denseMycelium");
    const ratio = (1 + 3 * MUTATIONS.denseMycelium) / (1 + 3 * COHESION.production);
    expect(tileProduction(s, tile)).toBeCloseTo(before * ratio, 10);
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
  // b's tail (out of the border's reach) keeps b above the M6 floor and less than 3× smaller than a.
  for (const h of [hex(3, 0), hex(2, 0), hex(1, 0), hex(4, 0), hex(5, 0), hex(4, -1), hex(5, -1), hex(6, -1)]) f.tiles.get(hexKey(h))!.owner = "b";
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

  it("Pillage: conquest bonus ×2; Parasitisme: the structure is kept", () => {
    const plain = duel();
    timeToTake(plain.f, plain.border);
    const looted = duel();
    give(looted.a, "plunder", "parasitism");
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
  it("Mycorhize: stronger Roots", () => {
    const s = game("roots");
    own(s, hex(1, 0));
    const tile = tileAt(s, hex(1, 0));
    const before = tileProduction(s, tile);
    give(s, "mycorrhiza");
    const bonusBefore = 1 + ROOTS.networkBonus;
    const bonusAfter = 1 + ROOTS.networkBonus * MUTATIONS.mycorrhiza;
    expect(tileProduction(s, tile)).toBeCloseTo((before / bonusBefore) * MUTATIONS.mycorrhiza * bonusAfter, 10);
  });

  it("Cordons mycéliens: no transport loss", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    give(s, "mycelialCords");
    expect(tileProduction(s, tileAt(s, hex(2, 0)))).toBeCloseTo(TERRAIN_STATS.humus.yieldPerSecond * (1 - 2 * TRANSPORT.lossPerHop * MUTATIONS.mycelialCords) * 1.05, 10);
  });

  it("Résilience: your tiles are taken slower", () => {
    const { f, b, border } = duel();
    give(b, "resilience");
    const plain = plainCaptureMs(f, "a", border);
    expect(timeToTake(f, border)).toBeCloseTo(plain / MUTATIONS.resilience, -4);
  });

  it("Bioluminescence: enemy networks seen 3 tiles away", () => {
    const { f, a } = duel();
    expect(visibleKeys(f, "a", true).has(hexKey(hex(3, 0)))).toBe(false);
    give(a, "bioluminescence");
    const seen = visibleKeys(f, "a", true);
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

describe("strains (GDD §4.3, M9: two strains)", () => {
  it("are chosen once, before the first new tile", () => {
    const s = game();
    expect(checkChooseStrain(s, "truffle")).toEqual({ ok: false, error: "unknown_strain" });
    expect(checkChooseStrain(s, "pleurotus")).toEqual({ ok: false, error: "unknown_strain" });
    expect(chooseStrain(s, "cordyceps").ok).toBe(true);
    expect(checkChooseStrain(s, "armillaria")).toEqual({ ok: false, error: "strain_chosen" });
    const late = game();
    own(late, hex(1, 0));
    expect(checkChooseStrain(late, "armillaria")).toEqual({ ok: false, error: "strain_chosen" });
  });

  it("Armillaire: grows from Monday to Sunday", () => {
    const f = newForest(5, Date.UTC(2026, 9, 5, 8), 4);
    const p = joinForest(f, "p", Date.UTC(2026, 9, 5, 8))!;
    const monday = productionRate(p, Date.UTC(2026, 9, 5, 9));
    const sunday = productionRate(p, Date.UTC(2026, 9, 11, 9));
    chooseStrain(p, "armillaria");
    expect(productionRate(p, Date.UTC(2026, 9, 5, 9))).toBeCloseTo(monday * STRAINS.armillaria.monday, 10);
    expect(productionRate(p, Date.UTC(2026, 9, 11, 9))).toBeCloseTo(sunday * (STRAINS.armillaria.monday + 6 * STRAINS.armillaria.perDay), 10);
  });

  it("Armillaire: its tiles are taken 30 % slower under 15 % less pressure, and it pushes 10 % less", () => {
    const { f, a, b, border } = duel();
    const own = pressure(f, "b", border);
    const plain = plainCaptureMs(f, "a", border);
    b.strain = "armillaria";
    expect(pressure(f, "b", border)).toBeCloseTo(own * STRAINS.armillaria.pressure, 10);
    // The attacker's push loses 15 %, and the capture itself is 30 % longer.
    const reduced = duel();
    reduced.b.strain = "armillaria";
    const taken = timeToTake(reduced.f, reduced.border);
    expect(taken).toBeGreaterThan(plain * STRAINS.armillaria.capturedTime * 0.99);
    expect(a.strain).toBeNull();
  });

  it("Cordyceps: pressure +20 %, production −10 %, captures 15 % faster", () => {
    const { f, a, border } = duel();
    const p = pressure(f, "a", border);
    const prod = productionRate(a);
    a.strain = "cordyceps";
    expect(pressure(f, "a", border)).toBeCloseTo(p * STRAINS.cordyceps.pressure, 10);
    expect(productionRate(a)).toBeCloseTo(prod * STRAINS.cordyceps.production, 10);
    const fast = duel();
    fast.a.strain = "cordyceps";
    const plain = plainCaptureMs(fast.f, "a", fast.border);
    expect(timeToTake(fast.f, fast.border)).toBeCloseTo(plain / STRAINS.cordyceps.captureSpeed, -4);
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
    expect(parseClientMessage('{"type":"chooseStrain","strain":"cordyceps"}')).toEqual({ type: "chooseStrain", strain: "cordyceps" });
  });
});
