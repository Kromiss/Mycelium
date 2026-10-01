import { describe, expect, it } from "vitest";
import { BORDERS, ECONOMY, ENZYMES_UNLOCK_TILES, FOREST, HUMIDITY, ROCK, ROOTS, STRUCTURES, TERRAIN_STATS, TRANSPORT, type Terrain } from "./balance";
import { defenceFactor, isProtected, joinForest, newForest, refreshReservations, resolveBorders, visibleKeys, type ForestState } from "./forest";
import { forestPlacement, generateForestMap, ringAt } from "./forestgen";
import {
  advance,
  build,
  checkBuild,
  checkColonize,
  colonizationCost,
  colonize,
  demolish,
  enzymeRate,
  humidity,
  networkHops,
  newGame,
  productionRate,
  refreshUnlocks,
  SOLO_PLAYER,
  structureCost,
  tileProduction,
  type GameState,
} from "./game";
import { hex, hexDistance, hexesInRadius, hexKey, type Hex } from "./hex";
import { fromSnapshot, parseClientMessage, toSnapshot } from "./protocol";
import { plainCaptureMs } from "./testing";

const T0 = Date.UTC(2026, 9, 8, 8); // A Thursday.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RICH = 1e9;

/** A solo game on a small map of one terrain, the start tile staying Humus. */
function game(terrain: Terrain = "humus"): GameState {
  const s = newGame(1, T0, 4);
  for (const t of s.tiles.values()) if (!(t.q === 0 && t.r === 0)) t.terrain = terrain;
  s.nutrients = RICH;
  return s;
}
const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;
const own = (s: GameState, ...hexes: Hex[]) => hexes.forEach((h) => (tileAt(s, h).owner = s.id));

describe("forest terrains (GDD §2.2)", () => {
  const cap = FOREST.capacity;

  it("puts Stumps in the centre only, and keeps Rock and Roots out of start zones", () => {
    for (const seed of [1, 2, 3]) {
      const m = generateForestMap(seed, cap);
      const count: Record<string, number> = {};
      for (const t of m.tiles) {
        count[t.terrain] = (count[t.terrain] ?? 0) + 1;
        if (t.terrain === "stump") expect(ringAt(m.radius, t)).toBe("centre");
        if (t.terrain === "rock" || t.terrain === "roots") {
          for (const s of m.spawns) expect(hexDistance(s, t)).toBeGreaterThan(FOREST.spawnClearRadius);
        }
      }
      for (const t of ["stump", "roots", "rock"]) expect(count[t]).toBeGreaterThan(0);
    }
  });

  it("gives every slice the same Rock and Roots, give or take a hex", () => {
    const m = generateForestMap(7, cap);
    const placement = forestPlacement(cap, m.radius);
    for (const terrain of ["rock", "roots"] as const) {
      const perSlice = new Array<number>(cap).fill(0);
      for (const t of m.tiles) if (t.terrain === terrain && ringAt(m.radius, t) !== "centre") perSlice[placement.get(hexKey(t))!.slice]! += 1;
      expect(Math.max(...perSlice) - Math.min(...perSlice)).toBeLessThanOrEqual(2);
    }
  });
});

describe("Enzymes (GDD §3)", () => {
  it("unlock at the 15th tile, and stay unlocked", () => {
    const s = game();
    const ring = [...hexesInRadius(hex(0, 0), 3)].filter((h) => h.q !== 0 || h.r !== 0).slice(0, ENZYMES_UNLOCK_TILES - 1);
    own(s, ...ring.slice(0, ENZYMES_UNLOCK_TILES - 2)); // 14 with the start tile.
    refreshUnlocks(s, T0);
    expect(s.enzymesUnlocked).toBe(false);
    own(s, ring[ENZYMES_UNLOCK_TILES - 2]!);
    refreshUnlocks(s, T0);
    expect(s.enzymesUnlocked).toBe(true);
    for (const h of ring) tileAt(s, h).owner = null;
    refreshUnlocks(s, T0);
    expect(s.enzymesUnlocked).toBe(true);
  });

  it("unlock from Tuesday in a season", () => {
    const f = newForest(3, Date.UTC(2026, 9, 5, 8), 4); // Monday.
    const p = joinForest(f, "p", Date.UTC(2026, 9, 5, 8))!;
    advance(p, Date.UTC(2026, 9, 5, 20));
    expect(p.enzymesUnlocked).toBe(false);
    advance(p, Date.UTC(2026, 9, 6, 8)); // Tuesday.
    expect(p.enzymesUnlocked).toBe(true);
  });

  it("are made by connected Glandes, twice as fast on dead wood, while the tile yields half", () => {
    const s = game();
    s.enzymesUnlocked = true;
    own(s, hex(1, 0), hex(0, 1));
    tileAt(s, hex(0, 1)).terrain = "deadwood";
    const before = tileProduction(s, tileAt(s, hex(1, 0)));
    expect(build(s, hex(1, 0), "gland", T0).ok).toBe(true);
    expect(build(s, hex(0, 1), "gland", T0).ok).toBe(true);
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo(before * (1 - STRUCTURES.glandPenalty), 10);
    const rate = STRUCTURES.glandEnzymesPerSecond * (1 + STRUCTURES.glandWoodFactor);
    expect(enzymeRate(s)).toBeCloseTo(rate, 12);
    advance(s, T0 + HOUR);
    expect(s.enzymes).toBeCloseTo(rate * 3600, 6);
  });

  it("pay for Rock, without the size factor, once unlocked", () => {
    const s = game("rock");
    s.enzymes = 1000;
    expect(checkColonize(s, hex(1, 0))).toEqual({ ok: false, error: "locked" });
    s.enzymesUnlocked = true;
    own(s, hex(0, 1), hex(-1, 1), hex(-1, 0));
    const cost = colonizationCost(s, tileAt(s, hex(1, 0)));
    expect(cost).toBeCloseTo(TERRAIN_STATS.rock.baseCost * (1 + ECONOMY.distanceFactor), 10);
    const nutrients = s.nutrients;
    expect(colonize(s, hex(1, 0), T0).ok).toBe(true);
    expect(s.enzymes).toBeCloseTo(1000 - cost, 10);
    expect(s.nutrients).toBe(nutrients);
    expect(tileAt(s, hex(1, 0)).owner).toBe(SOLO_PLAYER);
  });

  it("make the Rock queue wait for Enzymes", () => {
    const s = game("rock");
    s.enzymesUnlocked = true;
    expect(colonize(s, hex(1, 0), T0).ok).toBe(true);
    expect(tileAt(s, hex(1, 0)).owner).toBeNull();
    expect(s.queue).toHaveLength(1);
  });
});

describe("structures (GDD §4.1)", () => {
  it("need a connected tile of the player, one per tile, and get dearer with each one", () => {
    const s = game();
    own(s, hex(1, 0));
    tileAt(s, hex(2, 0)).owner = s.id; // Not linked to the Cœur? It is next to (1,0): linked.
    tileAt(s, hex(3, -3)).owner = s.id; // Isolated.
    expect(checkBuild(s, hex(3, -3), "node")).toEqual({ ok: false, error: "not_connected" });
    expect(checkBuild(s, hex(1, 0), "castle")).toEqual({ ok: false, error: "unknown_structure" });
    expect(checkBuild(s, hex(1, 0), "gland")).toEqual({ ok: false, error: "locked" });
    const first = structureCost(s, "node");
    expect(first).toBe(STRUCTURES.baseCost.node);
    expect(build(s, hex(1, 0), "node", T0).ok).toBe(true);
    expect(s.nutrients).toBe(RICH - first);
    expect(checkBuild(s, hex(1, 0), "reservoir")).toEqual({ ok: false, error: "has_structure" });
    expect(structureCost(s, "node")).toBeCloseTo(STRUCTURES.baseCost.node * STRUCTURES.costGrowth, 8);
    expect(demolish(s, hex(1, 0), T0).ok).toBe(true);
    expect(demolish(s, hex(1, 0), T0)).toEqual({ ok: false, error: "no_structure" });
    s.nutrients = 0;
    expect(checkBuild(s, hex(1, 0), "node")).toEqual({ ok: false, error: "not_enough_nutrients" });
  });

  it("Nœud de digestion: +50 % on its tile", () => {
    const s = game();
    own(s, hex(1, 0));
    const before = tileProduction(s, tileAt(s, hex(1, 0)));
    build(s, hex(1, 0), "node", T0);
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo(before * (1 + STRUCTURES.nodeBonus), 10);
  });

  it("Réservoir: humidity for the owner's neighbours, like a wetland", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    expect(humidity(s, hex(2, 0))).toBe(1);
    build(s, hex(1, 0), "reservoir", T0);
    expect(humidity(s, hex(2, 0))).toBe(1 + HUMIDITY.wetlandBonus);
    expect(humidity(s, hex(0, 0))).toBe(1 + HUMIDITY.wetlandBonus);
    // Someone else next to it gets nothing.
    const other = { ...s, id: "other" };
    expect(humidity(other, hex(2, 0))).toBe(1);
  });

  it("Rhizomorphe: crossing it costs no transport hop", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0), hex(3, 0));
    expect(networkHops(s).get(hexKey(hex(3, 0)))).toBe(3);
    build(s, hex(1, 0), "rhizomorph", T0);
    build(s, hex(2, 0), "rhizomorph", T0);
    const hops = networkHops(s);
    expect(hops.get(hexKey(hex(1, 0)))).toBe(0);
    expect(hops.get(hexKey(hex(2, 0)))).toBe(0);
    expect(hops.get(hexKey(hex(3, 0)))).toBe(1);
    const far = tileProduction(s, tileAt(s, hex(3, 0)));
    const near = tileProduction(s, tileAt(s, hex(0, 1)));
    expect(near).toBe(0); // Not owned.
    expect(far).toBeCloseTo(TERRAIN_STATS.humus.yieldPerSecond * (1 - TRANSPORT.lossPerHop) * 1.05, 10); // + one neighbour (M8)
  });

  it("Sclérote: one per player", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    expect(build(s, hex(1, 0), "sclerotium", T0).ok).toBe(true);
    expect(checkBuild(s, hex(2, 0), "sclerotium")).toEqual({ ok: false, error: "structure_limit" });
  });

  it("are lost with the tile when it withers", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    own(s, hex(-1, 0), hex(-1, 1), hex(0, -1), hex(0, 1), hex(1, -1), hex(-2, 0)); // Above the M6 floor of 7 tiles.
    build(s, hex(2, 0), "node", T0);
    tileAt(s, hex(1, 0)).owner = null; // Cut.
    advance(s, T0 + 2 * HOUR);
    expect(tileAt(s, hex(2, 0)).owner).toBeNull();
    expect(tileAt(s, hex(2, 0)).structure).toBeNull();
  });

  it("travel over the wire", () => {
    const s = game();
    own(s, hex(1, 0));
    s.enzymes = 12.5;
    s.enzymesUnlocked = true;
    build(s, hex(1, 0), "gland", T0);
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(back.tiles.get(hexKey(hex(1, 0)))!.structure).toBe("gland");
    expect(back.tiles.get(hexKey(hex(0, 1)))!.structure).toBeNull();
    expect(back.enzymes).toBe(12.5);
    expect(back.enzymesUnlocked).toBe(true);
    expect(parseClientMessage('{"type":"build","q":1,"r":0,"structure":"node"}')).toEqual({ type: "build", q: 1, r: 0, structure: "node" });
    expect(parseClientMessage('{"type":"demolish","q":1,"r":0}')).toEqual({ type: "demolish", q: 1, r: 0 });
    expect(parseClientMessage('{"type":"build","q":1,"r":0}')).toBeNull();
  });
});

describe("Racines d'arbre (GDD §2.2)", () => {
  it("add their mycorrhiza bonus to the whole network", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0));
    const before = productionRate(s);
    tileAt(s, hex(2, 0)).terrain = "roots";
    const roots = TERRAIN_STATS.roots.yieldPerSecond * (1 - 2 * TRANSPORT.lossPerHop);
    const humus = TERRAIN_STATS.humus.yieldPerSecond * (1 - 2 * TRANSPORT.lossPerHop);
    expect(productionRate(s)).toBeCloseTo((before - humus + roots) * (1 + ROOTS.networkBonus), 10);
  });
});

/** Two players face to face on one border tile. */
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
    p.nutrients = RICH;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}

/** Time for `a` to take the border tile, stepping 5 s at a time (Infinity if it never falls within 12 h). */
function timeToTake(f: ForestState, border: Hex): number {
  const tile = f.tiles.get(hexKey(border))!;
  for (let t = T0 + 5_000; t <= T0 + 12 * HOUR; t += 5_000) {
    resolveBorders(f, 5_000, t);
    if (tile.owner === "a") return t - T0;
  }
  return Infinity;
}

describe("structures at the border (GDD §4.1, §6.1)", () => {
  it("a plain Humus tile falls after its capture time", () => {
    const { f, border } = duel();
    const plain = plainCaptureMs(f, "a", border);
    expect(timeToTake(f, border)).toBeCloseTo(plain, -4);
  });

  it("Rhizomorphe halves the capture speed", () => {
    const { f, b, border } = duel();
    build(b, border, "rhizomorph", T0);
    expect(defenceFactor(f, f.tiles.get(hexKey(border))!)).toBe(STRUCTURES.rhizomorphCaptureFactor);
    const plain = plainCaptureMs(f, "a", border);
    expect(timeToTake(f, border)).toBeCloseTo(plain / STRUCTURES.rhizomorphCaptureFactor, -4);
  });

  it("the owner's Rock next to a tile is a rampart", () => {
    const { f, border } = duel();
    f.tiles.get(hexKey(hex(2, -1)))!.terrain = "rock";
    f.tiles.get(hexKey(hex(2, -1)))!.owner = "b";
    expect(defenceFactor(f, f.tiles.get(hexKey(border))!)).toBe(ROCK.rampartFactor);
  });

  it("Sclérote makes the tile impregnable", () => {
    const { f, b, border } = duel();
    build(b, border, "sclerotium", T0);
    expect(isProtected(f, f.tiles.get(hexKey(border))!, T0)).toBe(true);
    expect(timeToTake(f, border)).toBe(Infinity);
  });

  it("a conquered tile loses its structure", () => {
    const { f, b, border } = duel();
    build(b, border, "node", T0);
    timeToTake(f, border);
    expect(f.tiles.get(hexKey(border))!.structure).toBeNull();
  });

  it("Carpophore: seen by everyone, and sees 3 tiles around", () => {
    const { f, a, b } = duel();
    const far = hex(3, -3);
    expect(visibleKeys(f, "a", true).has(hexKey(hex(3, 0)))).toBe(false);
    build(b, hex(3, 0), "carpophore", T0);
    expect(visibleKeys(f, "a", true).has(hexKey(hex(3, 0)))).toBe(true);
    expect(visibleKeys(f, "b", true).has(hexKey(far))).toBe(f.tiles.has(hexKey(far)));
    expect(a.id).toBe("a");
  });
});
