import { describe, expect, it } from "vitest";
import { ACTIONS, PACTS, RELICS, SIGNALS, TERRAIN_STATS } from "./balance";
import { act, checkAct } from "./conflict";
import { advanceForest, deserializeForest, joinForest, newForest, refreshReservations, resolveBorders, serializeForest, visibleKeys, type ForestState } from "./forest";
import { advance, chooseRelic, colonize, mutationPoints, productionRate, signalRate, type GameState } from "./game";
import { hex, hexesInRadius, hexKey, type Hex } from "./hex";
import {
  allianceScore,
  answerInvite,
  betray,
  checkInvite,
  invite,
  isAllied,
  leavePact,
  listen,
  resolvePacts,
  sendResource,
} from "./social";

const T0 = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * `a` (19 tiles around (-2,0)) touches `b` (Cœur (3,0), a line towards a) on (1,0); `c` sits apart to
 * the south. Humus everywhere, no calendar.
 */
function arena(): { f: ForestState; a: GameState; b: GameState; c: GameState; border: Hex } {
  const f = newForest(11, T0 - 2 * DAY, 6, { calendar: false });
  for (const t of f.tiles.values()) t.terrain = "humus";
  const a = joinForest(f, "a", T0 - 2 * DAY)!;
  const b = joinForest(f, "b", T0 - 2 * DAY)!;
  const c = joinForest(f, "c", T0 - 2 * DAY)!;
  for (const t of f.tiles.values()) t.owner = null;
  a.heart = hex(-2, 0);
  for (const h of [...hexesInRadius(a.heart, 2), hex(0, 1)]) f.tiles.get(hexKey(h))!.owner = "a";
  b.heart = hex(3, 0);
  for (const h of [hex(3, 0), hex(2, 0), hex(1, 0), hex(4, 0), hex(5, 0), hex(4, -1), hex(5, -1), hex(6, -1)]) f.tiles.get(hexKey(h))!.owner = "b";
  c.heart = hex(0, 6);
  for (const h of hexesInRadius(c.heart, 1)) f.tiles.get(hexKey(h))!.owner = "c";
  for (const p of [a, b, c]) {
    p.lastSeenAt = null;
    p.updatedAt = T0;
    p.enzymesUnlocked = true;
    p.enzymes = 1_000;
    p.nutrients = 0;
    p.biomass = 0;
  }
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return { f, a, b, c, border: hex(1, 0) };
}

function ally(f: ForestState, from: string, to: string, at = T0): void {
  expect(invite(f, from, to, at)).toEqual({ ok: true });
  expect(answerInvite(f, to, from, true, at).ok).toBe(true);
}

describe("pacts (GDD §6.3)", () => {
  it("form on an accepted invitation and stop border fights and actions between members", () => {
    const { f, a, b, border } = arena();
    expect(checkAct(f, "a", "toxin", border, T0)).toEqual({ ok: true });
    ally(f, "a", "b");
    expect(a.pact).not.toBeNull();
    expect(a.pact).toBe(b.pact);
    expect(a.allies).toEqual(["b"]);
    expect(isAllied(f, "a", "b")).toBe(true);
    expect(checkAct(f, "a", "toxin", border, T0)).toEqual({ ok: false, error: "not_enemy" });
    for (let t = T0 + 5_000; t <= T0 + 6 * HOUR; t += 5_000) expect(resolveBorders(f, 5_000, t)).toEqual([]);
    expect(f.tiles.get(hexKey(border))!.owner).toBe("b");
  });

  it("take 2 to 4 colonies, one pact each, and refuse traitors", () => {
    const { f, a, b, c } = arena();
    expect(checkInvite(f, "a", "a", T0)).toEqual({ ok: false, error: "self" });
    expect(checkInvite(f, "a", "zz", T0)).toEqual({ ok: false, error: "unknown_player" });
    ally(f, "a", "b");
    expect(checkInvite(f, "c", "a", T0)).toEqual({ ok: false, error: "in_pact" });
    expect(invite(f, "b", "c", T0)).toEqual({ ok: true });
    expect(invite(f, "b", "c", T0)).toEqual({ ok: false, error: "already_invited" });
    expect(answerInvite(f, "c", "b", true, T0)).toMatchObject({ ok: true, event: { kind: "joined", player: "c" } });
    expect(c.allies.sort()).toEqual(["a", "b"]);
    const d = joinForest(f, "d", T0)!;
    const e = { id: "e" };
    ally(f, "a", "d");
    expect(f.pacts[0]!.members).toHaveLength(PACTS.maxMembers);
    joinForest(f, e.id, T0);
    expect(checkInvite(f, "a", "e", T0)).toEqual({ ok: false, error: "pact_full" });
    expect(answerInvite(f, "e", "a", true, T0)).toEqual({ ok: false, error: "no_invite" });
    expect(d.pact).toBe(a.pact);
  });

  it("share 5 % of each member's production equally, without creating any", () => {
    const solo = arena();
    advanceForest(solo.f, T0 + HOUR);
    const alone = { a: solo.a.nutrients, b: solo.b.nutrients };

    const { f, a, b } = arena();
    ally(f, "a", "b");
    advanceForest(f, T0 + HOUR);
    const pot = PACTS.share * (alone.a + alone.b);
    expect(a.nutrients).toBeCloseTo(alone.a * (1 - PACTS.share) + pot / 2, 3);
    expect(b.nutrients).toBeCloseTo(alone.b * (1 - PACTS.share) + pot / 2, 3);
    expect(a.nutrients + b.nutrients).toBeCloseTo(alone.a + alone.b, 3);
    // The smaller colony gains, the bigger one gives.
    expect(b.nutrients).toBeGreaterThan(alone.b);
    expect(a.nutrients).toBeLessThan(alone.a);
  });

  it("let a member leave after an hour of notice, without penalty; a pact of one is over", () => {
    const { f, a, b } = arena();
    ally(f, "a", "b");
    expect(leavePact(f, "a", T0)).toEqual({ ok: true });
    expect(leavePact(f, "a", T0)).toEqual({ ok: false, error: "already_leaving" });
    expect(resolvePacts(f, T0 + PACTS.leaveNoticeMs - 1)).toEqual([]);
    expect(isAllied(f, "a", "b")).toBe(true);
    const events = resolvePacts(f, T0 + PACTS.leaveNoticeMs);
    expect(events.map((e) => e.kind)).toEqual(["left", "ended"]);
    expect(a.pact).toBeNull();
    expect(b.pact).toBeNull();
    expect(a.taintedUntil).toBeNull();
    expect(f.pacts[0]!.endedAt).toBe(T0 + PACTS.leaveNoticeMs);
    expect(checkInvite(f, "a", "b", T0 + 2 * HOUR)).toEqual({ ok: true });
  });

  it("mark a traitor for a day: −15 % production and no pact", () => {
    const { f, a, b, c } = arena();
    ally(f, "a", "b");
    const before = productionRate(a, T0);
    const result = betray(f, "a", T0);
    expect(result).toMatchObject({ ok: true, events: [{ kind: "betrayed", player: "a", to: ["b"] }, { kind: "ended" }] });
    expect(a.taintedUntil).toBe(T0 + PACTS.taintMs);
    expect(productionRate(a, T0)).toBeCloseTo(before * (1 - PACTS.taintProduction), 6);
    expect(checkInvite(f, "a", "c", T0 + HOUR)).toEqual({ ok: false, error: "tainted" });
    expect(invite(f, "c", "a", T0 + HOUR)).toEqual({ ok: true });
    expect(answerInvite(f, "a", "c", true, T0 + HOUR)).toEqual({ ok: false, error: "tainted" });
    expect(checkInvite(f, "a", "c", T0 + PACTS.taintMs)).toEqual({ ok: true });
    // The penalty ends by itself, at the right time.
    const later = T0 + PACTS.taintMs + HOUR;
    advance(a, later);
    const after = productionRate(a, later);
    a.taintedUntil = null;
    expect(productionRate(a, later)).toBeCloseTo(after, 9);
    expect(c.pact).toBeNull();
  });

  it("score the biomass members earn while in the pact", () => {
    const { f, a, b } = arena();
    a.biomass = 1_000;
    ally(f, "a", "b");
    advanceForest(f, T0 + HOUR);
    const pact = f.pacts[0]!;
    const earned = a.biomass - 1_000 + b.biomass;
    expect(allianceScore(f, pact)).toBeCloseTo(earned, 6);
    betray(f, "b", T0 + HOUR);
    advanceForest(f, T0 + 2 * HOUR);
    // The pact ended: its score is frozen.
    expect(allianceScore(f, pact)).toBeCloseTo(earned, 6);
  });

  it("drop old invitations and survive a save", () => {
    const { f } = arena();
    ally(f, "a", "b");
    invite(f, "c", "a", T0);
    invite(f, "b", "c", T0);
    const copy = deserializeForest(JSON.parse(JSON.stringify(serializeForest(f))));
    expect(copy.pacts).toEqual(f.pacts);
    expect(copy.invites).toEqual(f.invites);
    expect(copy.players.get("a")!.pact).toBe(f.players.get("a")!.pact);
    resolvePacts(f, T0 + PACTS.inviteMs);
    expect(f.invites).toEqual([]);
  });
});

describe("chemical Signals (GDD §3)", () => {
  it("come from connected Roots tiles and appear with the first one", () => {
    const { f, a } = arena();
    expect(a.signalsUnlocked).toBe(false);
    for (const h of [hex(-2, 1), hex(-3, 1)]) f.tiles.get(hexKey(h))!.terrain = "roots";
    advanceForest(f, T0 + 2 * HOUR);
    expect(a.signalsUnlocked).toBe(true);
    expect(a.signals).toBeCloseTo(2 * SIGNALS.perRootsPerHour * 2, 6);
    expect(signalRate(a, T0 + 2 * HOUR) * 3_600).toBeCloseTo(2, 6);
  });

  it("send Nutrients or Enzymes to an ally only, with 5 % lost", () => {
    const { f, a, b, c } = arena();
    a.signals = 2;
    a.nutrients = 1_000;
    expect(sendResource(f, "a", "b", "nutrients", 100)).toEqual({ ok: false, error: "not_ally" });
    ally(f, "a", "b");
    expect(sendResource(f, "a", "b", "nutrients", 5_000)).toEqual({ ok: false, error: "not_enough_nutrients" });
    expect(sendResource(f, "a", "b", "nutrients", -1)).toEqual({ ok: false, error: "invalid_amount" });
    expect(sendResource(f, "a", "b", "nutrients", 100)).toEqual({ ok: true });
    expect(a.nutrients).toBe(900);
    expect(b.nutrients).toBeCloseTo(95, 9);
    expect(sendResource(f, "a", "b", "enzymes", 100)).toEqual({ ok: true });
    expect(b.enzymes).toBeCloseTo(1_095, 9);
    expect(a.signals).toBe(0);
    expect(sendResource(f, "a", "b", "enzymes", 1)).toEqual({ ok: false, error: "not_enough_signals" });
    expect(c.nutrients).toBe(0);
  });

  it("let a colony listen to a whole network through the fog for an hour", () => {
    const { f, a } = arena();
    const far = hexKey(hex(6, -1));
    expect(visibleKeys(f, "a", true).has(far)).toBe(false);
    a.signals = SIGNALS.listenCost;
    expect(listen(f, "a", "a", T0)).toEqual({ ok: false, error: "self" });
    expect(listen(f, "a", "b", T0)).toEqual({ ok: true });
    expect(a.signals).toBe(0);
    expect(visibleKeys(f, "a", true).has(far)).toBe(true);
    advanceForest(f, T0 + SIGNALS.listenMs);
    expect(visibleKeys(f, "a", true).has(far)).toBe(false);
    expect(listen(f, "a", "b", T0)).toEqual({ ok: false, error: "not_enough_signals" });
  });
});

describe("Ruins and relics (M7)", () => {
  it("give a relic to choose on the first colonisation, then turn into rubble", () => {
    const { f, a } = arena();
    const ruin = f.tiles.get(hexKey(hex(-5, 0)))!;
    ruin.terrain = "ruin";
    expect(colonize(a, ruin, T0)).toEqual({ ok: true });
    expect(a.enzymes).toBeLessThan(1_000);
    // Its growth: the Ruine's, longer in inner zones (M9).
    expect(ruin.growthEndsAt! - T0).toBeGreaterThanOrEqual(TERRAIN_STATS.ruin.growthSeconds * 1000);
    advanceForest(f, ruin.growthEndsAt! + 1);
    expect(ruin.owner).toBe("a");
    expect(ruin.terrain).toBe("rubble");
    expect(a.relicPicks).toBe(1);
    const points = mutationPoints(a);
    expect(chooseRelic(a, "shiny")).toEqual({ ok: false, error: "unknown_relic" });
    expect(chooseRelic(a, "insight")).toEqual({ ok: true });
    expect(mutationPoints(a)).toBe(points + RELICS.insight);
    expect(chooseRelic(a, "vigour")).toEqual({ ok: false, error: "no_relic" });
  });

  it("vigour adds 10 % production", () => {
    const { a } = arena();
    const before = productionRate(a, T0);
    a.relics.push("vigour");
    expect(productionRate(a, T0)).toBeCloseTo(before * (1 + RELICS.vigour), 6);
  });

  it("actions still work between colonies outside the pact", () => {
    const { f, b, c } = arena();
    ally(f, "a", "c");
    b.enzymes = 1_000;
    expect(checkAct(f, "b", "toxin", hex(0, 0), T0).ok).toBe(true);
    expect(act(f, "b", "toxin", hex(0, 0), T0)).toEqual({ ok: true });
    expect(b.enzymes).toBe(1_000 - ACTIONS.toxin.cost);
  });
});
