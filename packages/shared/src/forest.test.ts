import { describe, expect, it } from "vitest";
import { BORDERS, FOREST, TERRAIN_STATS, VISION_RADIUS } from "./balance";
import {
  advanceForest,
  captureSpeed,
  deserializeForest,
  freeSlices,
  isProtected,
  joinForest,
  newForest,
  refreshReservations,
  resolveBorders,
  serializeForest,
  visibleKeys,
  type ForestState,
} from "./forest";
import {
  centreDistance,
  forestPlacement,
  forestRadius,
  generateForestMap,
  richnessAt,
  ringAt,
} from "./forestgen";
import { checkColonize, networkHops, type GameState } from "./game";
import { hex, hexDistance, hexesInRadius, hexKey, hexNeighbors, type Hex } from "./hex";

const T0 = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("forest map (GDD §2.5)", () => {
  const cap = FOREST.capacity;
  const map = generateForestMap(42, cap);
  const placement = forestPlacement(cap, map.radius);
  const layout = { kind: "forest", capacity: cap } as const;

  it("is deterministic and sized for 40 to 60 hexes per player", () => {
    expect(generateForestMap(42, cap)).toEqual(map);
    const perPlayer = map.tiles.length / cap;
    expect(perPlayer).toBeGreaterThanOrEqual(40);
    expect(perPlayer).toBeLessThanOrEqual(60);
    expect(forestRadius(cap)).toBe(map.radius);
  });

  it("gives every slice the same land, give or take a hex", () => {
    for (const seed of [1, 2, 3]) {
      const m = generateForestMap(seed, cap);
      const count = new Array<number>(cap).fill(0);
      const value = new Array<number>(cap).fill(0);
      for (const t of m.tiles) {
        if (ringAt(m.radius, t) === "centre") continue; // Shared by everyone.
        const s = placement.get(hexKey(t))!.slice;
        count[s]! += 1;
        value[s]! += TERRAIN_STATS[t.terrain].yieldPerSecond * richnessAt(layout, m.radius, t);
      }
      expect(Math.max(...count) - Math.min(...count)).toBeLessThanOrEqual(2);
      const mean = value.reduce((a, b) => a + b, 0) / cap;
      for (const v of value) expect(Math.abs(v - mean) / mean).toBeLessThan(0.12);
    }
  });

  it("places one spawn per slice, on the rim, on clear land that reaches the centre", () => {
    expect(new Set(map.spawns.map(hexKey)).size).toBe(cap);
    const byKey = new Map(map.tiles.map((t) => [hexKey(t), t.terrain]));
    map.spawns.forEach((s, i) => {
      expect(placement.get(hexKey(s))!.slice).toBe(i);
      expect(ringAt(map.radius, s)).toBe("rim");
      expect(byKey.get(hexKey(s))).toBe("humus");
      for (const h of hexesInRadius(s, FOREST.spawnClearRadius)) {
        if (byKey.has(hexKey(h))) expect(byKey.get(hexKey(h))).not.toBe("wetland");
      }
    });
    // Every land tile is reachable from the centre.
    const land = new Set(map.tiles.filter((t) => t.terrain !== "wetland").map(hexKey));
    const seen = new Set([hexKey(hex(0, 0))]);
    const stack: Hex[] = [hex(0, 0)];
    while (stack.length) {
      for (const n of hexNeighbors(stack.pop()!)) {
        if (land.has(hexKey(n)) && !seen.has(hexKey(n))) {
          seen.add(hexKey(n));
          stack.push(n);
        }
      }
    }
    expect(seen.size).toBe(land.size);
  });

  it("gets richer towards the centre: ×1 rim, ×1.5 middle, ×3 to ×5 centre", () => {
    const rim = map.spawns[0]!;
    expect(richnessAt(layout, map.radius, rim)).toBe(1);
    expect(richnessAt(layout, map.radius, hex(0, 0))).toBe(5);
    const middle = map.tiles.find((t) => ringAt(map.radius, t) === "middle")!;
    expect(richnessAt(layout, map.radius, middle)).toBe(1.5);
    for (const t of map.tiles.filter((x) => ringAt(map.radius, x) === "centre")) {
      const r = richnessAt(layout, map.radius, t);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(5);
    }
    // More dead wood in the centre than on the rim.
    const share = (ring: string) => {
      const land = map.tiles.filter((t) => ringAt(map.radius, t) === ring && t.terrain !== "wetland");
      return land.filter((t) => t.terrain === "deadwood").length / land.length;
    };
    expect(share("centre")).toBeGreaterThan(share("rim") + 0.3);
    expect(richnessAt({ kind: "solo" }, 10, hex(0, 0))).toBe(1);
  });
});

describe("joining a forest", () => {
  it("spreads players around the forest and refuses when full", () => {
    const f = newForest(7, T0, 6);
    const a = joinForest(f, "a", T0)!;
    const b = joinForest(f, "b", T0)!;
    expect(f.tiles.get(hexKey(a.spawn))!.owner).toBe("a");
    expect(hexDistance(a.spawn, b.spawn)).toBeGreaterThan(f.radius); // Opposite sides.
    for (let i = 0; i < 4; i++) expect(joinForest(f, `p${i}`, T0)).not.toBeNull();
    expect(freeSlices(f)).toEqual([]);
    expect(joinForest(f, "late", T0)).toBeNull();
  });

  it("shares the tiles between players and runs every economy", () => {
    const f = newForest(7, T0, 6);
    const a = joinForest(f, "a", T0)!;
    const b = joinForest(f, "b", T0)!;
    expect(a.tiles).toBe(b.tiles);
    advanceForest(f, T0 + 60_000);
    expect(a.nutrients).toBeGreaterThan(10);
    expect(b.nutrients).toBeGreaterThan(10);
    expect(f.updatedAt).toBe(T0 + 60_000);
  });

  it("keeps start zones for their players (GDD §6.4)", () => {
    const f = newForest(7, T0, 6);
    const a = joinForest(f, "a", T0)!;
    const free = f.spawns.find((s) => f.tiles.get(hexKey(s))!.owner === null)!;
    const nearFree = hexNeighbors(free).find((h) => f.tiles.get(hexKey(h))?.terrain !== "wetland")!;
    // A player touching a free slice's start zone cannot colonise it.
    f.tiles.get(hexKey(hexNeighbors(nearFree).find((h) => hexDistance(h, free) === 2)!))!.owner = "a";
    expect(checkColonize(a, nearFree)).toEqual({ ok: false, error: "reserved" });
    // Once someone joins that slice, the zone is theirs for 24 h, then open.
    const b = joinForest(f, "b", T0 + HOUR)!;
    expect(hexKey(b.spawn)).not.toBe(hexKey(a.spawn));
    const zoneOfB = f.tiles.get(hexKey(hexNeighbors(b.spawn)[0]!))!;
    expect(zoneOfB.reservedFor).toBe("b");
    advanceForest(f, T0 + HOUR + BORDERS.protectedMs);
    expect(zoneOfB.reservedFor).toBeNull();
  });

});

/**
 * Two players meeting in the centre: A owns a compact blob (6 tiles within 2 of the border tile),
 * B a thin line (3 tiles), both connected to their Cœur; joined long ago so start zones are not
 * protected. A pushes twice as hard: full speed.
 */
function arena(): { f: ForestState; a: GameState; b: GameState; border: Hex } {
  const f = newForest(11, T0 - 2 * DAY, 4);
  for (const t of f.tiles.values()) if (t.terrain === "wetland") t.terrain = "humus";
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
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}

describe("borders (GDD §6.1)", () => {
  it("speeds up with the pressure ratio", () => {
    expect(captureSpeed(1, 1)).toBe(0);
    expect(captureSpeed(1.5, 1)).toBeCloseTo(0.5, 10);
    expect(captureSpeed(2, 1)).toBe(1);
    expect(captureSpeed(9, 1)).toBe(1);
    expect(captureSpeed(1, 0)).toBe(1);
    expect(captureSpeed(0, 1)).toBe(0);
  });

  it("lets the stronger network take a tile after its capture time", () => {
    const { f, a, border } = arena();
    const tile = f.tiles.get(hexKey(border))!;
    const duration = BORDERS.captureMs[tile.terrain];
    let t = T0;
    const step = 5_000;
    while (t < T0 + duration - step) {
      t += step;
      expect(resolveBorders(f, step, t)).toEqual([]);
    }
    expect(tile.capture?.by).toBe("a");
    expect(tile.capture!.progress).toBeGreaterThan(0.9);
    const events = resolveBorders(f, step, t + step);
    expect(events).toEqual([{ q: border.q, r: border.r, from: "b", to: "a" }]);
    expect(tile.owner).toBe("a");
    expect(a.trophies).toBe(1);
    expect(a.biomass).toBeGreaterThan(0);
  });

  it("disconnects what lies behind a lost tile", () => {
    const { f, b } = arena();
    // B's line runs (3,0) Cœur → (2,0) → (1,0); losing (2,0) cuts (1,0) off.
    f.tiles.get("2,0")!.owner = "a";
    advanceForest(f, T0 + 1_000);
    expect(networkHops(b).has("1,0")).toBe(false);
    expect(f.tiles.get("1,0")!.disconnectedSince).toBe(T0);
  });

  it("does nothing between equal networks and lets progress fall back", () => {
    const { f, border } = arena();
    const tile = f.tiles.get(hexKey(border))!;
    tile.capture = { by: "a", progress: 0.5 };
    // Remove most of A: now A is weaker than B around the border.
    for (const t of f.tiles.values()) if (t.owner === "a" && !(t.q === 0 && t.r === 0) && !(t.q === -1 && t.r === 0) && !(t.q === -2 && t.r === 0)) t.owner = null;
    resolveBorders(f, 60_000, T0 + 60_000);
    expect(tile.owner).toBe("b");
    expect(tile.capture?.progress ?? 0).toBeLessThan(0.5);
  });

  it("never takes a Cœur, nor a new player's start zone", () => {
    const { f, b } = arena();
    const heartTile = f.tiles.get(hexKey(b.heart))!;
    expect(isProtected(f, heartTile, T0)).toBe(true);
    const fresh = joinForest(f, "fresh", T0)!;
    const start = f.tiles.get(hexKey(fresh.spawn))!;
    expect(isProtected(f, start, T0 + HOUR)).toBe(true);
    fresh.heart = hex(0, 0); // Pretend the Cœur moved away: the zone stays protected for 24 h.
    expect(isProtected(f, start, T0 + HOUR)).toBe(true);
    expect(isProtected(f, start, T0 + BORDERS.protectedMs + 1)).toBe(false);
  });

  it("halves captures on a player away for more than 2 h", () => {
    const run = (away: boolean) => {
      const { f, b, border } = arena();
      if (away) b.lastSeenAt = T0 - BORDERS.shieldAfterMs;
      resolveBorders(f, 60_000, T0 + 60_000);
      return f.tiles.get(hexKey(border))!.capture!.progress;
    };
    expect(run(true)).toBeCloseTo(run(false) * BORDERS.shieldFactor, 10);
  });
});

describe("serialisation", () => {
  it("round-trips a forest, players sharing one tile map", () => {
    const { f, a } = arena();
    f.tiles.get("1,0")!.capture = { by: "a", progress: 0.4 };
    a.trophies = 3;
    const back = deserializeForest(JSON.parse(JSON.stringify(serializeForest(f))));
    expect(back.tiles).toEqual(f.tiles);
    expect(back.players.get("a")!.tiles).toBe(back.tiles);
    expect({ ...back.players.get("a")!, tiles: null, seed: 0 }).toEqual({ ...a, tiles: null, seed: 0 });
    expect(back.spawns).toEqual(f.spawns);
  });
});

describe("fog (GDD §2.1)", () => {
  it("shows only tiles near the player's network", () => {
    const f = newForest(3, T0, 6);
    const a = joinForest(f, "a", T0)!;
    const seen = visibleKeys(f, "a");
    for (const k of seen) {
      const [q, r] = k.split(",").map(Number) as [number, number];
      expect(hexDistance({ q, r }, a.spawn)).toBeLessThanOrEqual(VISION_RADIUS);
    }
    expect(seen.size).toBe(7);
    expect(centreDistance(a.spawn)).toBeGreaterThan(f.radius / 2);
  });
});
