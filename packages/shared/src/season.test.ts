import { describe, expect, it } from "vitest";
import { joinForest, newForest, resolveBorders } from "./forest";
import { advance, biomassRate, colonizationCost, colonize, effectsAt, growthDurationMs, newGame, productionRate, type GameState } from "./game";
import { hex, hexKey } from "./hex";
import { mondayBonusFor, nextPhaseChange, PHASE_EFFECTS, phaseAt, seasonAt } from "./season";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Monday 5 October 2026, 00:00 in Paris (UTC+2). */
const MONDAY = Date.UTC(2026, 9, 4, 22);

describe("calendar (Europe/Paris)", () => {
  it("starts seasons on Monday 00:00 Paris and wipes the next Monday", () => {
    const s = seasonAt(Date.UTC(2026, 9, 7, 12)); // Wednesday
    expect(s.start).toBe(MONDAY);
    expect(s.end).toBe(MONDAY + 7 * DAY);
    expect(s.freezeAt).toBe(MONDAY + 7 * DAY - 60_000);
    expect(s.week).toBe(41);
    expect(s.year).toBe(2026);
    expect(seasonAt(MONDAY - 1).end).toBe(MONDAY);
    expect(seasonAt(MONDAY).start).toBe(MONDAY);
  });

  it("follows daylight saving time", () => {
    // Clocks go back on Sunday 25 October 2026: that week is one hour longer.
    const s = seasonAt(Date.UTC(2026, 9, 21));
    expect(s.start).toBe(Date.UTC(2026, 9, 18, 22)); // Monday 19, 00:00 CEST
    expect(s.end).toBe(Date.UTC(2026, 9, 25, 23)); // Monday 26, 00:00 CET
    expect(s.end - s.start).toBe(7 * DAY + HOUR);
    expect(s.days[6]).toBe(Date.UTC(2026, 9, 24, 22)); // Sunday 00:00 CEST
  });

  it("names the day's phase and when it ends", () => {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((d) => phaseAt(MONDAY + d * DAY + HOUR).id);
    expect(ids).toEqual(["germination", "spring", "summer", "fall", "autumn", "frost", "decay"]);
    expect(nextPhaseChange(MONDAY + HOUR)).toBe(MONDAY + DAY);
    const sunday = phaseAt(MONDAY + 6 * DAY + HOUR);
    expect(sunday.endsAt).toBe(MONDAY + 7 * DAY - 60_000);
    const frozen = phaseAt(MONDAY + 7 * DAY - 30_000);
    expect(frozen.frozen).toBe(true);
    expect(frozen.effects.biomass).toBe(0);
    expect(frozen.effects.captureSpeed).toBe(0);
  });

  it("gives the Monday bonus by previous rank (GDD §8.2)", () => {
    expect(mondayBonusFor(null)).toBe(0);
    expect(mondayBonusFor({ rank: 1, players: 12 })).toBe(0.1);
    expect(mondayBonusFor({ rank: 2, players: 12 })).toBe(0.05);
    expect(mondayBonusFor({ rank: 6, players: 12 })).toBe(0.05);
    expect(mondayBonusFor({ rank: 7, players: 12 })).toBe(0.02);
  });
});

/** A calendar-following solo game where every tile is Humus. */
function seasonal(at: number): GameState {
  const s = { ...newGame(3, at, 4), calendar: true };
  for (const t of s.tiles.values()) t.terrain = "humus";
  s.nutrients = 1e9;
  return s;
}

describe("phase effects (GDD §7)", () => {
  it("makes hyphae grow twice as fast on Monday", () => {
    const s = seasonal(MONDAY + HOUR);
    colonize(s, hex(1, 0), MONDAY + HOUR);
    const t = s.tiles.get(hexKey(hex(1, 0)))!;
    expect(t.growthEndsAt! - (MONDAY + HOUR)).toBe(growthDurationMs("humus", s.upgrades) / 2);
  });

  it("changes production by day, and wetlands shelter from the drought", () => {
    const rateOn = (day: number, wet = false) => {
      const at = MONDAY + day * DAY + HOUR;
      const s = seasonal(at);
      if (wet) s.tiles.get(hexKey(hex(1, 0)))!.terrain = "wetland";
      return productionRate(s, at);
    };
    const base = rateOn(3); // Thursday: no production modifier.
    expect(rateOn(1) / base).toBeCloseTo(1.2, 10);
    expect(rateOn(2) / base).toBeCloseTo(0.75, 10);
    expect(rateOn(5) / base).toBeCloseTo(0.7, 10);
    expect(rateOn(2, true) / rateOn(3, true)).toBeCloseTo(1, 10);
  });

  it("makes colonising cheaper on Friday and biomass worth more on Sunday", () => {
    const s = seasonal(MONDAY + 3 * DAY);
    const tile = s.tiles.get(hexKey(hex(1, 0)))!;
    const thursday = colonizationCost(s, tile, MONDAY + 3 * DAY + HOUR);
    expect(colonizationCost(s, tile, MONDAY + 4 * DAY + HOUR) / thursday).toBeCloseTo(0.7, 10);
    expect(biomassRate(s, MONDAY + 6 * DAY + HOUR) / biomassRate(s, MONDAY + 3 * DAY + HOUR)).toBeCloseTo(1.5, 10);
    expect(effectsAt({ ...s, calendar: false }, MONDAY + 6 * DAY + HOUR).biomass).toBe(1);
  });

  it("integrates exactly across midnight, and stops counting after the freeze", () => {
    const at = MONDAY + DAY - HOUR; // Monday 23:00
    const s = seasonal(at);
    s.biomass = 0;
    advance(s, at + 2 * HOUR); // One hour of Monday, one hour of Tuesday.
    const expected = (productionRate(seasonal(at), at) + productionRate(seasonal(at + 2 * HOUR), at + 2 * HOUR)) * 3600;
    // Wear lowers production a little over the two hours.
    expect((s.nutrients - 1e9) / expected).toBeGreaterThan(0.9);
    expect((s.nutrients - 1e9) / expected).toBeLessThan(1);
    // Same result in small steps: the midnight change is an exact event.
    const stepped = seasonal(at);
    for (let t = at; t <= at + 2 * HOUR; t += 7_000) advance(stepped, t);
    advance(stepped, at + 2 * HOUR);
    expect(Math.abs(stepped.nutrients - s.nutrients) / (s.nutrients - 1e9)).toBeLessThan(1e-6);

    const end = seasonal(MONDAY + 7 * DAY - 2 * 60_000);
    end.biomass = 0;
    advance(end, MONDAY + 7 * DAY - 1);
    const counted = end.biomass;
    expect(counted).toBeGreaterThan(0);
    const before = end.biomass;
    advance(end, MONDAY + 7 * DAY - 1);
    expect(end.biomass).toBe(before);
    expect(biomassRate(end, MONDAY + 7 * DAY - 30_000)).toBe(0);
  });

  it("adds the Monday bonus on Monday only", () => {
    const s = seasonal(MONDAY + HOUR);
    const plain = productionRate(s, MONDAY + HOUR);
    s.mondayBonus = 0.05;
    expect(productionRate(s, MONDAY + HOUR) / plain).toBeCloseTo(1.05, 10);
    expect(productionRate(s, MONDAY + DAY + HOUR) / productionRate({ ...s, mondayBonus: 0 }, MONDAY + DAY + HOUR)).toBe(1);
  });

  it("stops border fights on Monday and after the freeze", () => {
    const f = newForest(5, MONDAY - 3 * DAY, 4);
    const a = joinForest(f, "a", MONDAY - 3 * DAY)!;
    const b = joinForest(f, "b", MONDAY - 3 * DAY)!;
    for (const t of f.tiles.values()) {
      if (t.terrain === "wetland") t.terrain = "humus";
      t.owner = null;
    }
    a.heart = hex(-2, 0);
    for (const [q, r] of [[-2, 0], [-1, 0], [0, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [-2, 1], [-1, -1]] as const) f.tiles.get(`${q},${r}`)!.owner = "a";
    b.heart = hex(3, 0);
    for (const [q, r] of [[3, 0], [2, 0], [1, 0]] as const) f.tiles.get(`${q},${r}`)!.owner = "b";
    const border = f.tiles.get("1,0")!;
    resolveBorders(f, 60_000, MONDAY + HOUR);
    expect(border.capture).toBeNull();
    resolveBorders(f, 60_000, MONDAY + 3 * DAY + HOUR); // Thursday: twice as fast.
    const thursday = border.capture!.progress;
    border.capture = null;
    resolveBorders(f, 60_000, MONDAY + 5 * DAY + HOUR); // Saturday: twice as slow.
    expect(thursday / border.capture!.progress).toBeCloseTo(4, 10);
    border.capture = null;
    resolveBorders(f, 60_000, MONDAY + 7 * DAY - 30_000);
    expect(border.capture).toBeNull();
    expect(PHASE_EFFECTS.germination.captureSpeed).toBe(0);
  });
});
