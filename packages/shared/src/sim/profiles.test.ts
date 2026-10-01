import { describe, expect, it } from "vitest";
import { isOnline, simulateProfiles, STUDY_PROFILES, summarizeProfiles } from "./profiles";

/**
 * The profile study's harness (schedules and aims). It checks that the robots do what their profile
 * says, not balance numbers: those are read from `simulate:profiles` and discussed with the owner.
 */
describe("robot profiles", () => {
  const result = simulateProfiles({ days: 3, stepMs: 600_000 });
  const last = result.rows.filter((r) => r.hour === 72);

  it("schedules: always online, or one 5-minute session every 3 hours", () => {
    expect(isOnline("always", 90 * 60_000)).toBe(true);
    expect(isOnline("every3h", 0)).toBe(true);
    expect(isOnline("every3h", 4 * 60_000)).toBe(true);
    expect(isOnline("every3h", 10 * 60_000)).toBe(false);
    expect(isOnline("every3h", 3 * 3_600_000 + 60_000)).toBe(true);
  });

  it("gives every profile the same number of seats", () => {
    const counts = STUDY_PROFILES.map((p) => result.players.filter((x) => x.profile === p.key).length);
    expect(new Set(counts).size).toBe(1);
  });

  it("keeps home robots out of the centre and sends centre robots deeper", () => {
    const home = last.filter((r) => r.profile.endsWith("-home"));
    const centre = last.filter((r) => r.profile.endsWith("-centre"));
    for (const r of home) expect(r.tilesByRing.centre, r.id).toBe(0);
    // M9: the inner zones cost more and take longer, so after 3 days the centre robots are on their way
    // (zone 5 and beyond are reached around day 4–5): more of their tiles are past the rim.
    const deep = (rows: typeof last) => rows.reduce((s, r) => s + r.tilesByRing.middle + r.tilesByRing.centre, 0) / rows.reduce((s, r) => s + r.tiles, 0);
    console.log(`share of tiles past the rim on day 3: home ${(deep(home) * 100).toFixed(1)} %, centre ${(deep(centre) * 100).toFixed(1)} %`);
    expect(deep(centre)).toBeGreaterThan(deep(home));
  });

  it("summarises the final standings by profile", () => {
    const summary = summarizeProfiles([result]);
    expect(summary.map((s) => s.profile).sort()).toEqual(STUDY_PROFILES.map((p) => p.key).sort());
    expect(summary.reduce((s, x) => s + x.wins, 0)).toBe(1);
    for (const s of summary) expect(Number.isFinite(s.medianShare)).toBe(true);
  });
}, 120_000);
