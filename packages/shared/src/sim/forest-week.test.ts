import { describe, expect, it } from "vitest";
import { formatForestReport, simulateForestWeek } from "./forest-week";
import { NEUTRAL_PLAN } from "./week";

/**
 * Pacing of a forest (owner's target): 12 players, half active (12 h/day) and half casual
 * (3 × 10 min/day). The forest must not fill up in a few hours: about a third on day 1, 90 % around
 * day 4, almost everything by day 5. Nobody may stop growing after the first day. The robots play the
 * economy alone here (no strain, no mutation); `balance.test.ts` covers strains and mutations.
 */
describe("forest week pacing", () => {
  const result = simulateForestWeek({ days: 5, stepMs: 180_000, decisionEveryMinutes: 15, planOf: () => NEUTRAL_PLAN });
  const days = result.snapshots.filter((s) => s.hour % 24 === 0);
  const day = (d: number) => days.find((s) => s.hour === d * 24)!;

  it("fills the forest around day 4–5, not in a few hours", () => {
    console.log(formatForestReport(result));
    expect(day(1).occupancy).toBeGreaterThan(0.2);
    expect(day(1).occupancy).toBeLessThan(0.5);
    expect(result.filled.ninety).not.toBeNull();
    expect(result.filled.ninety! / 24).toBeGreaterThan(3);
    expect(result.filled.ninety! / 24).toBeLessThan(5);
    expect(day(5).occupancy).toBeGreaterThan(0.95);
  }, 120_000);

  it("keeps every player growing after the first day", () => {
    for (const p of day(1).players) {
      const tiles = [1, 2, 3].map((d) => day(d).players.find((x) => x.id === p.id)!.tiles);
      const biomass = [1, 2, 3, 4, 5].map((d) => day(d).players.find((x) => x.id === p.id)!.biomass);
      expect(tiles[2]!, `${p.id} tiles by day`).toBeGreaterThan(tiles[0]!);
      for (let i = 1; i < biomass.length; i++) expect(biomass[i]!, `${p.id} biomass day ${i + 1}`).toBeGreaterThan(biomass[i - 1]!);
      expect(biomass[2]! / biomass[0]!, `${p.id} biomass ×`).toBeGreaterThan(2);
    }
  }, 120_000);
});
