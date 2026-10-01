import { describe, expect, it } from "vitest";
import { joinForest, newForest, pressure, resolveBorders, tileCounts, type ForestState } from "./forest";
import { cloneGame, networkHops, productionRate, temerityFactor, type GameState, type Tile } from "./game";
import { hexKey, hexNeighbors } from "./hex";
import { mulberry32 } from "./rng";
import { borderTilesOf, makeTile, neighbourTiles, ownedCountOf, ownedTilesOf, ownerCounts, tileKey } from "./tile-index";
import { STRUCTURE_IDS, TERRAINS } from "./balance";

const T0 = Date.UTC(2026, 9, 6, 9); // A Tuesday.

/**
 * M9 speed-up: the rules keep indexes and caches on the tiles (owners, neighbours, hops, densities…).
 * Whatever is changed on the tiles, every cached answer must equal the one computed from scratch on a
 * fresh copy of the map (a copy has no cache).
 */
describe("tile index (M9)", () => {
  function forest(): ForestState {
    const f = newForest(3, T0, 4, { calendar: false });
    for (const id of ["a", "b", "c"]) joinForest(f, id, T0);
    return f;
  }

  /** A fresh copy of the forest's players, on new tiles: nothing cached yet. */
  function fresh(f: ForestState): Map<string, GameState> {
    const tiles = cloneGame([...f.players.values()][0]!).tiles;
    return new Map([...f.players.values()].map((p) => [p.id, { ...cloneGame(p), tiles }]));
  }

  function randomChange(f: ForestState, rng: () => number): void {
    const tiles = [...f.tiles.values()];
    const t = tiles[Math.floor(rng() * tiles.length)]!;
    const players = [...f.players.keys()];
    const x = rng();
    if (x < 0.4) t.owner = rng() < 0.2 ? null : players[Math.floor(rng() * players.length)]!;
    else if (x < 0.55) t.growthEndsAt = rng() < 0.5 ? null : T0 + 60_000;
    else if (x < 0.65) t.structure = rng() < 0.4 ? null : STRUCTURE_IDS[Math.floor(rng() * STRUCTURE_IDS.length)]!;
    else if (x < 0.75) t.terrain = TERRAINS[Math.floor(rng() * TERRAINS.length)]!;
    else if (x < 0.85) t.level = Math.floor(rng() * 30);
    else if (x < 0.92) t.effects = rng() < 0.5 ? [] : [{ kind: "cut", by: "x", until: T0 + 3_600_000 }];
    else {
      // Move a Cœur onto one of its own tiles.
      const p = f.players.get(players[Math.floor(rng() * players.length)]!)!;
      const own = ownedTilesOf(f.tiles, p.id);
      if (own.length > 0) p.heart = { q: own[0]!.q, r: own[0]!.r };
    }
  }

  it("answers like a fresh computation after any change", () => {
    const f = forest();
    const rng = mulberry32(42);
    for (let step = 0; step < 400; step++) {
      for (let k = 0; k < 1 + Math.floor(rng() * 5); k++) randomChange(f, rng);
      if (step % 10 !== 0) {
        // Read now and then between changes, so that caches get filled and then go stale.
        for (const p of f.players.values()) networkHops(p, T0);
        continue;
      }
      const copy = fresh(f);
      for (const p of f.players.values()) {
        const c = copy.get(p.id)!;
        expect(ownedTilesOf(f.tiles, p.id).map((t) => tileKey(f.tiles, t))).toEqual([...c.tiles.values()].filter((t) => t.owner === p.id).map((t) => hexKey(t)));
        expect(ownedCountOf(f.tiles, p.id)).toBe([...c.tiles.values()].filter((t) => t.owner === p.id).length);
        expect([...networkHops(p, T0)]).toEqual([...networkHops(c, T0)]);
        expect([...networkHops(p, T0, true)]).toEqual([...networkHops(c, T0, true)]);
        expect(productionRate(p, T0)).toBe(productionRate(c, T0));
        p.mutations = ["temerity"];
        c.mutations = ["temerity"];
        expect(temerityFactor(p)).toBe(temerityFactor(c));
        p.mutations = [];
      }
      const counts = ownerCounts(f.tiles);
      for (const [id, n] of tileCounts(f)) expect(counts.get(id)).toBe(n);
      // Border tiles: owned, touching another owner, in map order.
      const expected = [...f.tiles.values()].filter((t) => t.owner !== null && hexNeighbors(t).some((n) => {
        const o = f.tiles.get(hexKey(n))?.owner;
        return o !== undefined && o !== null && o !== t.owner;
      }));
      expect(borderTilesOf(f.tiles)).toEqual(expected);
      // Densities around border tiles.
      const tiles = [...copy.values()][0]!.tiles;
      const plain: ForestState = { ...f, tiles, players: copy };
      for (const t of expected.slice(0, 20)) {
        for (const id of f.players.keys()) expect(pressure(f, id, t)).toBe(pressure(plain, id, tiles.get(hexKey(t))!));
      }
    }
  });

  it("keeps resolving borders like before when the map is not indexed", () => {
    // Plain objects instead of tracked tiles: every query scans, with the same answers.
    const a = forest();
    const plainTiles = new Map<string, Tile>();
    for (const [k, t] of a.tiles) plainTiles.set(k, { ...t, effects: [...t.effects] });
    const players = new Map([...a.players.values()].map((p) => [p.id, { ...cloneGame(p), tiles: plainTiles }]));
    const b: ForestState = { ...a, tiles: plainTiles, players };
    for (const f of [a, b]) {
      // Two colonies face to face.
      for (const t of f.tiles.values()) {
        t.owner = t.q < 0 ? "a" : t.q > 0 ? "b" : null;
        t.growthEndsAt = null;
      }
      f.players.get("a")!.heart = { q: -1, r: 0 };
      f.players.get("b")!.heart = { q: 1, r: 0 };
    }
    for (let t = T0 + 60_000; t < T0 + 3_600_000; t += 60_000) {
      expect(resolveBorders(a, 60_000, t)).toEqual(resolveBorders(b, 60_000, t));
    }
    expect([...a.tiles.values()].map((t) => t.owner)).toEqual([...b.tiles.values()].map((t) => t.owner));
  });

  it("lists a tile's neighbours on the map, in direction order", () => {
    const f = forest();
    const t = f.tiles.get("0,0")!;
    expect(neighbourTiles(f.tiles, t).map((n) => hexKey(n))).toEqual(hexNeighbors(t).map(hexKey).filter((k) => f.tiles.has(k)));
  });

  it("freezes effects so that they are replaced, never changed in place", () => {
    const t = makeTile({ q: 0, r: 0, terrain: "humus", owner: null, growthEndsAt: null, growthStartedAt: null, disconnectedSince: null, capture: null, reservedFor: null, structure: null, toxic: false, effects: [], level: 0 });
    expect(() => (t.effects as unknown as unknown[]).push({ kind: "cut", by: "a", until: 1 })).toThrow();
    t.effects = [{ kind: "cut", by: "a", until: 1 }];
    expect(t.effects).toHaveLength(1);
    // Spread and JSON see plain fields.
    expect({ ...t }).toMatchObject({ terrain: "humus", owner: null, level: 0 });
    expect(JSON.parse(JSON.stringify(t))).toMatchObject({ q: 0, r: 0, terrain: "humus", effects: [{ kind: "cut" }] });
  });
});
