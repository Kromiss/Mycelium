import { describe, expect, it } from "vitest";
import { ACTION_EFFECTS, ACTIONS, ANTI_FRUSTRATION, BORDERS, CENTRE_RISK } from "./balance";
import { act, actionCost, checkAct } from "./conflict";
import { advanceForest, inCentre, joinForest, newForest, refreshReservations, resolveBorders, type ForestState } from "./forest";
import { advance, biomassRate, networkHops, placeBiomass, tileProduction, type GameState } from "./game";
import { hex, hexesInRadius, hexKey, type Hex } from "./hex";
import { seasonAt } from "./season";
import { plainCaptureMs } from "./testing";
import { cohesionDefence } from "./forest";

const T0 = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;

/**
 * `a` (21 tiles around (-2,0)) faces `b` (8 tiles: Cœur (3,0), then (2,0) and (1,0) towards a, and a
 * tail to the east) on the border tile (1,0), in the centre of a small forest without calendar.
 */
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
    p.enzymesUnlocked = true;
    p.enzymes = 1_000;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, border: hex(1, 0) };
}

const tile = (f: ForestState, h: Hex) => f.tiles.get(hexKey(h))!;
const owners = (f: ForestState, id: string) => [...f.tiles.values()].filter((t) => t.owner === id).length;

/** Resolves borders 5 s at a time from `from` until the tile changes hands (Infinity after `limit`). */
function timeToTake(f: ForestState, h: Hex, from = T0, limit = 12 * HOUR): number {
  const t0 = tile(f, h).owner;
  for (let t = from + 5_000; t <= from + limit; t += 5_000) {
    resolveBorders(f, 5_000, t);
    if (tile(f, h).owner !== t0) return t - from;
  }
  return Infinity;
}

describe("active actions (GDD §6.2)", () => {
  it("need an enemy tile touching the connected network, Enzymes, and respect cooldowns", () => {
    const { f, a, b, border } = arena();
    expect(checkAct(f, "a", "fireball", border, T0)).toEqual({ ok: false, error: "unknown_action" });
    expect(checkAct(f, "a", "toxin", hex(0, 0), T0)).toEqual({ ok: false, error: "not_enemy" });
    expect(checkAct(f, "a", "toxin", hex(5, 0), T0)).toEqual({ ok: false, error: "not_adjacent" });
    a.enzymes = 5;
    expect(checkAct(f, "a", "toxin", border, T0)).toEqual({ ok: false, error: "not_enough_enzymes" });
    a.enzymes = 1_000;
    expect(act(f, "a", "toxin", border, T0)).toEqual({ ok: true });
    expect(a.enzymes).toBe(1_000 - ACTIONS.toxin.cost);
    expect(checkAct(f, "a", "toxin", border, T0 + HOUR)).toEqual({ ok: false, error: "action_cooldown" });
    expect(checkAct(f, "a", "toxin", border, T0 + ACTIONS.toxin.cooldownMs)).toEqual({ ok: true });
    // Other actions have their own cooldown.
    expect(checkAct(f, "a", "siphon", border, T0 + HOUR)).toEqual({ ok: true });
    b.enzymesUnlocked = false;
    expect(checkAct(f, "b", "toxin", hex(1, -1), T0)).toEqual({ ok: false, error: "locked" });
  });

  it("are forbidden on Monday and once the season is frozen (GDD §7)", () => {
    const monday = seasonAt(T0).start;
    const { f } = arena();
    const calendar: ForestState = { ...f, calendar: true };
    expect(checkAct(calendar, "a", "toxin", hex(1, 0), monday + HOUR)).toEqual({ ok: false, error: "no_pvp" });
    expect(checkAct(calendar, "a", "toxin", hex(1, 0), monday + DAY + HOUR)).toEqual({ ok: true });
    expect(checkAct(calendar, "a", "toxin", hex(1, 0), monday + 7 * DAY - 30_000)).toEqual({ ok: false, error: "no_pvp" });
  });

  it("spare a new player's start zone", () => {
    const { f, b } = arena();
    (b as { joinedAt: number }).joinedAt = T0 - HOUR;
    (b as { spawn: Hex }).spawn = hex(2, 0);
    expect(checkAct(f, "a", "toxin", hex(1, 0), T0)).toEqual({ ok: false, error: "protected" });
  });

  it("Assaut takes the tile 4× faster, even below twice the pressure", () => {
    const { f, border } = arena();
    const plain = timeToTake(arena().f, border);
    expect(plain).toBeCloseTo(plainCaptureMs(f, "a", border), -4);
    act(f, "a", "assault", border, T0);
    // Full speed ×4: a Humus tile falls in 45 min / 4 (slowed by its cohesion), within the 30 min of the assault.
    const { hold } = cohesionDefence(f, tile(f, border));
    expect(timeToTake(f, border)).toBeCloseTo((BORDERS.captureMs.humus * hold) / ACTION_EFFECTS.assaultSpeed, -4);
  });

  it("Assaut needs the attacker above parity", () => {
    const { f, a, border } = arena();
    // Leave a with just a thin line: below b's pressure around the border.
    for (const t of f.tiles.values()) if (t.owner === "a") t.owner = null;
    for (const h of [hex(0, 0), hex(1, -1)]) tile(f, h).owner = "a"; // 2 tiles against b's 3.
    a.heart = hex(0, 0);
    expect(act(f, "a", "assault", border, T0)).toEqual({ ok: true });
    expect(timeToTake(f, border, T0, 2 * HOUR)).toBe(Infinity);
  });

  it("Toxine halves the tile and its neighbours of the same owner for 1 h", () => {
    const { f, b, border } = arena();
    const near = tile(f, hex(2, 0));
    const far = tile(f, hex(5, 0));
    const before = [tileProduction(b, tile(f, border)), tileProduction(b, near), tileProduction(b, far)];
    act(f, "a", "toxin", border, T0);
    advanceForest(f, T0 + MIN);
    const during = [tileProduction(b, tile(f, border)), tileProduction(b, near), tileProduction(b, far)];
    expect(during[0]! / before[0]!).toBeCloseTo(ACTION_EFFECTS.toxinProduction, 2);
    expect(during[1]! / before[1]!).toBeCloseTo(ACTION_EFFECTS.toxinProduction, 2);
    expect(during[2]! / before[2]!).toBeCloseTo(1, 2);
    advanceForest(f, T0 + ACTIONS.toxin.durationMs + MIN);
    expect(tileProduction(b, tile(f, border)) / before[0]!).toBeGreaterThan(0.9);
    expect(tile(f, border).effects).toEqual([]); // Pruned once over.
  });

  it("Coupure cuts the network for 45 min without withering what lies behind", () => {
    const { f, a, b } = arena();
    tile(f, hex(2, -1)).owner = "a"; // a now touches (2,0), between b's Cœur and (1,0).
    const behind = tile(f, hex(1, 0));
    expect(act(f, "a", "cut", hex(2, 0), T0)).toEqual({ ok: true });
    advanceForest(f, T0 + 40 * MIN);
    const hops = networkHops(b, T0 + 40 * MIN);
    expect(hops.has(hexKey(hex(2, 0)))).toBe(false);
    expect(hops.has(hexKey(behind))).toBe(false);
    expect(behind.disconnectedSince).toBeNull();
    advanceForest(f, T0 + 2 * HOUR);
    expect(behind.owner).toBe("b");
    expect(networkHops(b, T0 + 2 * HOUR).has(hexKey(behind))).toBe(true);
    // A Rhizomorphe and the Cœur cannot be cut.
    a.cooldowns = {};
    tile(f, hex(2, 0)).structure = "rhizomorph";
    expect(checkAct(f, "a", "cut", hex(2, 0), T0 + 2 * HOUR)).toEqual({ ok: false, error: "uncuttable" });
    tile(f, hex(3, -1)).owner = "a";
    expect(checkAct(f, "a", "cut", hex(3, 0), T0 + 2 * HOUR)).toEqual({ ok: false, error: "uncuttable" });
  });

  it("Siphon hands 20 % of the victim's nearby production to the caster", () => {
    const { f, a, b, border } = arena();
    act(f, "a", "siphon", border, T0);
    const siphoned = [...f.tiles.values()].filter((t) => t.effects.some((e) => e.kind === "siphon"));
    // (1,0), (2,0) and (3,0) are within 2 of the border; b's tail is not.
    expect(siphoned.map((t) => hexKey(t)).sort()).toEqual(["1,0", "2,0", "3,0"]);
    const perSecond = siphoned.reduce((sum, t) => sum + tileProduction(b, t, networkHops(b), T0 + 1), 0);
    // What b produces on those tiles, net of the siphon, is a quarter of what goes to a.
    advance(b, T0 + 10 * MIN);
    const taken = b.siphoned["a"]!;
    expect(taken / (perSecond * 600)).toBeCloseTo(ACTION_EFFECTS.siphonShare / (1 - ACTION_EFFECTS.siphonShare), 2);
    // The forest then hands it to a.
    const aBefore = a.nutrients;
    advanceForest(f, T0 + 10 * MIN);
    expect(a.nutrients - aBefore).toBeGreaterThanOrEqual(taken);
    expect(b.siphoned).toEqual({});
  });

  it("cost 3× more against a player 3× smaller, and a Coupure half in the centre", () => {
    const { f, a, border } = arena();
    expect(inCentre(f, border)).toBe(true);
    expect(actionCost(f, "a", "toxin", tile(f, border))).toBe(ACTIONS.toxin.cost);
    expect(actionCost(f, "a", "cut", tile(f, border))).toBe(ACTIONS.cut.cost * CENTRE_RISK.cutCost);
    for (const h of hexesInRadius(hex(-4, 3), 1)) tile(f, h).owner = "a";
    tile(f, hex(-5, 2)).owner = "a"; // 24 tiles or more: a is now 3× bigger than b (8).
    expect(actionCost(f, "a", "toxin", tile(f, border))).toBe(ACTIONS.toxin.cost * ANTI_FRUSTRATION.bullyActionCost);
    expect(a.id).toBe("a");
  });
});

describe("anti-frustration (GDD §6.4)", () => {
  it("takes the Cœur 4× slower, then rebirths it on the Sclérote and shields it for a day", () => {
    const { f, b } = arena();
    // b's Cœur sits on the border.
    b.heart = hex(1, 0);
    tile(f, hex(5, 0)).structure = "sclerotium";
    const plain = plainCaptureMs(f, "a", hex(1, 0));
    const took = timeToTake(f, hex(1, 0), T0, 12 * HOUR);
    expect(took).toBeCloseTo(plain / ANTI_FRUSTRATION.heartCaptureFactor, -4);
    expect(b.heart).toEqual(hex(5, 0));
    expect(b.heartShieldUntil).toBe(T0 + took + ANTI_FRUSTRATION.heartShieldMs);
  });

  it("without a Sclérote, rebirths the Cœur on the closest tile", () => {
    const { f, b } = arena();
    b.heart = hex(1, 0);
    timeToTake(f, hex(1, 0));
    expect(b.heart).toEqual(hex(2, 0));
  });

  it("slows captures 4× against a player 3× smaller", () => {
    const { f, border } = arena();
    for (const h of hexesInRadius(hex(-4, 3), 1)) tile(f, h).owner = "a";
    tile(f, hex(-5, 2)).owner = "a";
    const plain = plainCaptureMs(f, "a", border);
    expect(timeToTake(f, border)).toBeCloseTo(plain / ANTI_FRUSTRATION.bullyCaptureFactor, -4);
  });

  it("never lets a player fall below 7 tiles", () => {
    const { f, b, border } = arena();
    tile(f, hex(6, -1)).owner = null;
    expect(owners(f, "b")).toBe(ANTI_FRUSTRATION.floorTiles);
    expect(timeToTake(f, border)).toBe(Infinity);
    expect(checkAct(f, "a", "assault", border, T0)).toEqual({ ok: false, error: "protected" });
    expect(checkAct(f, "a", "toxin", border, T0)).toEqual({ ok: true });
    expect(b.id).toBe("b");
  });
});

describe("centre risk (GDD §2.5)", () => {
  it("counts the biomass of centre tiles ×1.5", () => {
    const { f, b } = arena();
    const centre = tile(f, hex(1, 0));
    expect(placeBiomass(b, centre)).toBe(CENTRE_RISK.biomass);
    const rim = [...f.tiles.values()].find((t) => !inCentre(f, t))!;
    expect(placeBiomass(b, rim)).toBe(1);
    const before = b.biomass;
    const rate = biomassRate(b);
    advanceForest(f, T0 + MIN);
    expect((b.biomass - before) / 60 / rate).toBeCloseTo(1, 2); // (the tiles wear a little meanwhile)
  });
});
