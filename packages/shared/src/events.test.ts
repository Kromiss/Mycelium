import { describe, expect, it } from "vitest";
import { DYING_TREE, EVENTS, FIRE, NEMATODES, STORM, TREEFALL, type EventKind } from "./balance";
import { eventNotices, resolveEvents, scheduleEvents, type ForestEvent } from "./events";
import { advanceForest, joinForest, newForest, type ForestState } from "./forest";
import { ringAt } from "./forestgen";
import { productionRate, tileProduction, type GameState } from "./game";
import { hex, hexesInRadius, hexKey, type Hex } from "./hex";
import { seasonAt } from "./season";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;
const SEASON = seasonAt(Date.UTC(2026, 9, 7, 12));
/** Wednesday noon of that season. */
const WED = SEASON.days[2]! + 12 * HOUR;

describe("event schedule (GDD §7)", () => {
  const list = scheduleEvents(1234, SEASON.start);

  it("is drawn from the seed", () => {
    expect(scheduleEvents(1234, SEASON.start)).toEqual(list);
    expect(scheduleEvents(99, SEASON.start)).not.toEqual(list);
  });

  it("has 1 to 3 random events a day from Tuesday to Sunday, none on Monday", () => {
    const random = list.filter((e) => e.kind !== "tree" && !(e.kind === "treefall" && e.startsAt === SEASON.days[3]! + TREEFALL.hour * HOUR));
    for (let d = 0; d < 7; d++) {
      const n = random.filter((e) => e.startsAt >= SEASON.days[d]! && e.startsAt < SEASON.days[d + 1]!).length;
      if (d === 0) expect(n).toBe(0);
      else {
        expect(n).toBeGreaterThanOrEqual(EVENTS.perDay.min);
        expect(n).toBeLessThanOrEqual(EVENTS.perDay.max);
      }
    }
    for (const e of list) expect(e.announceAt).toBe(e.startsAt - EVENTS.announceMs);
  });

  it("drops trees on Thursday morning and raises the Dying tree on Thursday and Sunday afternoon", () => {
    expect(list.some((e) => e.kind === "treefall" && e.startsAt === SEASON.days[3]! + TREEFALL.hour * HOUR)).toBe(true);
    const trees = list.filter((e) => e.kind === "tree").map((e) => e.startsAt);
    expect(trees).toEqual(DYING_TREE.days.map((d) => SEASON.days[d]! + DYING_TREE.hour * HOUR));
  });

  it("leaves out what was announced before the forest opened", () => {
    const late = scheduleEvents(1234, SEASON.start, SEASON.days[4]!);
    expect(late.every((e) => e.announceAt >= SEASON.days[4]!)).toBe(true);
    expect(late.length).toBeLessThan(list.length);
  });
});

/**
 * A calendar forest on Wednesday noon: `a` holds the 37 tiles around (-3,0), `b` those around (4,0),
 * all Humus.
 */
function forest(): { f: ForestState; a: GameState; b: GameState } {
  const f = newForest(7, SEASON.start, 4);
  const a = joinForest(f, "a", SEASON.start)!;
  const b = joinForest(f, "b", SEASON.start)!;
  for (const t of f.tiles.values()) {
    t.terrain = "humus";
    t.owner = null;
  }
  a.heart = hex(-3, 0);
  b.heart = hex(4, 0);
  for (const h of hexesInRadius(a.heart, 3)) f.tiles.get(hexKey(h))!.owner = "a";
  for (const h of hexesInRadius(b.heart, 3)) f.tiles.get(hexKey(h))!.owner = "b";
  for (const p of [a, b]) {
    p.updatedAt = WED;
    p.lastSeenAt = null;
  }
  f.updatedAt = WED;
  return { f, a, b };
}

/** An event already announced, starting at `at`, on the given tiles. */
function announced(kind: EventKind, at: number, cells: Hex[], durationMs = 0): ForestEvent {
  return {
    id: 1,
    kind,
    announceAt: at - EVENTS.announceMs,
    startsAt: at,
    endsAt: at + durationMs,
    status: "announced",
    q: cells[0]!.q,
    r: cells[0]!.r,
    cells,
    strong: false,
  };
}

const owned = (f: ForestState, id: string) => [...f.tiles.values()].filter((t) => t.owner === id).length;

describe("events (GDD §7)", () => {
  it("are placed and announced an hour before they start", () => {
    const { f } = forest();
    f.events = scheduleEvents(f.seed, SEASON.start, WED);
    const next = f.events[0]!;
    expect(resolveEvents(f, 5_000, next.announceAt - 1)).toEqual([]);
    const out = resolveEvents(f, 5_000, next.announceAt);
    expect(out.map((o) => o.phase)).toContain("announced");
    expect(next.status).toBe("announced");
    expect(next.cells.length).toBeGreaterThan(0);
    expect(eventNotices(out, "a")).toContainEqual({ kind: next.kind, phase: "announced", q: next.q, r: next.r });
  });

  it("Orage: +50 % production in its zone for 4 h", () => {
    const { f, a } = forest();
    const cells = hexesInRadius(a.heart, STORM.radius);
    f.events = [announced("storm", WED, cells, STORM.durationMs)];
    const tile = f.tiles.get(hexKey(hex(-2, 0)))!;
    const before = tileProduction(a, tile);
    resolveEvents(f, 5_000, WED);
    expect(tileProduction(a, tile, undefined, WED + MIN) / before).toBeCloseTo(1 + STORM.bonus, 2);
    advanceForest(f, WED + STORM.durationMs + MIN);
    resolveEvents(f, 5_000, WED + STORM.durationMs + MIN);
    expect(f.events[0]!.status).toBe("over");
    // Back to normal, apart from the wear of the last 4 h.
    expect(tileProduction(a, tile) / before).toBeCloseTo(1 - tile.exhaustion, 2);
  });

  it("Incendie: burns at most 10 % of a colony, never its Cœur, and leaves rich ashes", () => {
    const { f, a } = forest();
    const cells = hexesInRadius(a.heart, FIRE.radius); // 19 tiles of a, Cœur included.
    f.events = [announced("fire", WED, cells)];
    const out = resolveEvents(f, 5_000, WED);
    const lost = out.flatMap((o) => o.lost);
    expect(lost).toHaveLength(Math.floor(37 * EVENTS.maxLossShare));
    expect(lost.some((l) => l.q === a.heart.q && l.r === a.heart.r)).toBe(false);
    expect(owned(f, "a")).toBe(37 - lost.length);
    const burnt = f.tiles.get(hexKey(lost[0]!))!;
    expect(burnt.owner).toBeNull();
    expect(burnt.effects).toContainEqual({ kind: "ashes", by: "event", until: WED + FIRE.ashesMs, power: FIRE.ashesFactor });
    expect(f.events[0]!.status).toBe("over");
    expect(eventNotices(out, "a")).toContainEqual({ kind: "fire", phase: "lost", q: cells[0]!.q, r: cells[0]!.r, tiles: lost.length });
  });

  it("never takes a colony below the floor of 7 tiles", () => {
    const { f, b } = forest();
    for (const t of f.tiles.values()) if (t.owner === "b" && ![...hexesInRadius(b.heart, 1)].some((h) => hexKey(h) === hexKey(t))) t.owner = null;
    expect(owned(f, "b")).toBe(7);
    f.events = [announced("boar", WED, hexesInRadius(b.heart, 1))];
    resolveEvents(f, 5_000, WED);
    expect(owned(f, "b")).toBe(7);
  });

  it("Sanglier: turns the soil over", () => {
    const { f } = forest();
    const line = [hex(-1, 1), hex(0, 1), hex(1, 1)];
    for (const h of line) f.tiles.get(hexKey(h))!.exhaustion = 0.3;
    f.events = [announced("boar", WED, line)];
    resolveEvents(f, 5_000, WED);
    for (const h of line) expect(f.tiles.get(hexKey(h))!.exhaustion).toBe(0);
  });

  it("Chute d'arbres: new Stumps", () => {
    const { f } = forest();
    const cells = [hex(0, 3), hex(1, 3)];
    f.events = [announced("treefall", WED, cells)];
    resolveEvents(f, 5_000, WED);
    for (const h of cells) expect(f.tiles.get(hexKey(h))!.terrain).toBe("stump");
  });

  it("Carcasse: a rich tile for 12 h, then the old terrain again", () => {
    const { f } = forest();
    const cell = hex(0, 3);
    f.events = [announced("carcass", WED, [cell], 12 * HOUR)];
    resolveEvents(f, 5_000, WED);
    expect(f.tiles.get(hexKey(cell))!.terrain).toBe("carcass");
    resolveEvents(f, 5_000, WED + 12 * HOUR);
    expect(f.tiles.get(hexKey(cell))!.terrain).toBe("humus");
  });

  it("Nématodes: bite every 30 min, and pay biomass to those who kill them", () => {
    const { f, a } = forest();
    const cells = hexesInRadius(hex(-4, 1), NEMATODES.radius);
    f.events = [announced("nematodes", WED, cells, NEMATODES.durationMs)];
    resolveEvents(f, 5_000, WED);
    const e = f.events[0]!;
    expect(e.maxHp).toBeGreaterThanOrEqual(NEMATODES.minHp);
    const before = owned(f, "a");
    // First bite after 30 min; a's tiles in the zone digest them meanwhile.
    let lostTotal = 0;
    let t = WED;
    const biomass0 = a.biomass;
    while (e.status !== "over" && t < WED + NEMATODES.durationMs) {
      t += 5 * MIN;
      advanceForest(f, t);
      lostTotal += resolveEvents(f, 5 * MIN, t).flatMap((o) => o.lost).length;
    }
    expect(before - owned(f, "a")).toBe(lostTotal);
    expect(lostTotal).toBeLessThanOrEqual(Math.floor(37 * EVENTS.maxLossShare));
    if (e.killed) expect(a.biomass - biomass0).toBeGreaterThan((e.damage!["a"] ?? 0) * NEMATODES.rewardFactor * 0.99);
    expect(e.status).toBe("over");
  });

  it("Arbre mourant: digested by the colonies touching it, paid pro rata, then Stumps", () => {
    const { f, a, b } = forest();
    // The tree stands between a and b: both touch it.
    const cells = hexesInRadius(hex(1, -1), 1).filter((h) => f.tiles.get(hexKey(h))!.owner === null);
    for (const h of hexesInRadius(hex(1, -1), 1)) f.tiles.get(hexKey(h))!.owner = null;
    f.events = [announced("tree", WED, hexesInRadius(hex(1, -1), 1), DYING_TREE.durationMs)];
    resolveEvents(f, 5_000, WED);
    const e = f.events[0]!;
    expect(f.tiles.get(hexKey(hex(1, -1)))!.terrain).toBe("tree");
    const total = productionRate(a, WED) + productionRate(b, WED);
    expect(e.maxHp).toBeGreaterThanOrEqual(DYING_TREE.minHp);
    const bio0 = { a: a.biomass, b: b.biomass };
    const trophies0 = a.trophies + b.trophies;
    let t = WED;
    while (e.status !== "over") {
      t += 5 * MIN;
      advanceForest(f, t);
      resolveEvents(f, 5 * MIN, t);
    }
    const dealt = e.damage!;
    expect((dealt["a"] ?? 0) + (dealt["b"] ?? 0)).toBeGreaterThan(0);
    // Pro rata: each gets a quarter of what they digested as biomass (plus their own production).
    const production = { a: a.biomass - bio0.a - (dealt["a"] ?? 0) * DYING_TREE.biomassFactor, b: b.biomass - bio0.b - (dealt["b"] ?? 0) * DYING_TREE.biomassFactor };
    expect(production.a).toBeGreaterThan(0);
    expect(production.b).toBeGreaterThan(0);
    expect(a.trophies + b.trophies).toBe(trophies0 + 1);
    expect(f.tiles.get(hexKey(hex(1, -1)))!.terrain).toBe("stump");
    expect(total).toBeGreaterThan(0);
    expect(cells.length).toBeGreaterThan(0);
  });

  it("does nothing in a forest without calendar", () => {
    const f = newForest(7, WED, 4, { calendar: false });
    expect(resolveEvents(f, 5_000, WED + DAY)).toEqual([]);
    expect(f.events).toEqual([]);
  });

  it("places the world boss in the centre, away from Cœurs", () => {
    const { f } = forest();
    f.events = [{ ...announced("tree", WED, [hex(0, 0)], DYING_TREE.durationMs), status: "scheduled" }];
    resolveEvents(f, 5_000, WED - EVENTS.announceMs);
    const e = f.events[0]!;
    expect(e.cells).toHaveLength(7);
    expect(ringAt(f.radius, e)).toBe("centre");
  });
});
