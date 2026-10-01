import { describe, expect, it } from "vitest";
import { ANTI_FRUSTRATION } from "../balance";
import { formatForestReport, simulateForestWeek } from "./forest-week";
import { NEUTRAL_PLAN } from "./week";

/**
 * Pacing of a forest (owner's target, revised 1 October 2026): 12 players, half active (12 h/day) and
 * half casual (3 × 10 min/day). The forest must not fill up in a few hours: about a third on day 1, and
 * 90 % between day 6 and day 7. Nobody may stop growing after the first day. The robots play the economy
 * alone here (no strain, no mutation); `balance.test.ts` covers strains and mutations.
 *
 * Tests run on the small tiles of `TILE_SCALE` 1 (vitest.config.ts), a rough copy of the real forest: the
 * exact day is measured at the real scale by the Simulate workflow (`sim-matrix.json`). Here the forest
 * must still be filling up through the whole week.
 */
describe("forest week pacing", () => {
  const result = simulateForestWeek({ days: 7, stepMs: 180_000, decisionEveryMinutes: 15, planOf: () => NEUTRAL_PLAN });
  const days = result.snapshots.filter((s) => s.hour % 24 === 0);
  const day = (d: number) => days.find((s) => s.hour === d * 24)!;

  it("fills the forest through the week, not in a few hours", () => {
    console.log(formatForestReport(result));
    expect(day(1).occupancy).toBeGreaterThan(0.2);
    expect(day(1).occupancy).toBeLessThan(0.5);
    for (let d = 2; d <= 7; d++) expect(day(d).occupancy, `day ${d}`).toBeGreaterThan(day(d - 1).occupancy);
    if (result.filled.ninety !== null) expect(result.filled.ninety / 24).toBeGreaterThan(5);
    expect(day(7).occupancy).toBeGreaterThan(0.8);
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

/**
 * Roadmap M6, "Terminé quand": a test season sees cuts, reversals and at least one shared world boss,
 * without an absent player losing everything. Robots with their default plans, at war.
 */
describe("conflict and events week", () => {
  const result = simulateForestWeek({ days: 7, stepMs: 180_000, decisionEveryMinutes: 15 });

  it("has cuts, a shared Dying tree, reversals, and nobody below the floor", () => {
    console.log(formatForestReport(result));
    const c = result.conflict;
    expect(c.actions.cut).toBeGreaterThan(0);
    expect(c.actions.assault + c.actions.toxin + c.actions.siphon).toBeGreaterThan(0);
    expect(c.bosses.length).toBeGreaterThanOrEqual(1);
    // M9: the Dying tree comes in the zone of the day; the robots share at least one of them.
    expect(Math.max(...c.bosses.map((b) => b.contributors))).toBeGreaterThanOrEqual(2);
    expect(c.minTiles).toBeGreaterThanOrEqual(ANTI_FRUSTRATION.floorTiles);
    // Reversals: someone overtakes someone else between day 3 and day 5.
    const order = (d: number) => [...result.snapshots.find((x) => x.hour === d * 24)!.players].sort((a, b) => b.biomass - a.biomass).map((p) => p.id);
    expect(order(5)).not.toEqual(order(3));
  }, 300_000);
});

