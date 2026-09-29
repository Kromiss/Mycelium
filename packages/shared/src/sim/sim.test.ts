import { describe, expect, it } from "vitest";
import { formatReport, PROFILES, simulateWeek, type DayReport } from "./week";

/**
 * Roadmap M2: a solo week, simulated in CI for a casual profile (3 × 10 min/day) and an active one
 * (12 h/day). The curves are printed in the CI log; the assertions guard against broken economies
 * (NaN, stalls, runaways) rather than pinning balance numbers, which are still placeholders.
 */
describe("solo week simulation", () => {
  const runs: Record<string, DayReport[]> = {};
  const get = (name: keyof typeof PROFILES) =>
    (runs[name] ??= simulateWeek(PROFILES[name], { decisionEverySeconds: name === "hardcore" ? 60 : 30 }));

  it.each(["casual", "hardcore"] as const)("%s: produces a sane, growing score every day", (name) => {
    const reports = get(name);
    console.log(`${PROFILES[name].name}\n${formatReport(reports)}`);
    expect(reports).toHaveLength(7);
    for (const r of reports) {
      for (const v of [r.rate, r.biomass, r.nutrients]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
    for (let i = 1; i < reports.length; i++) expect(reports[i]!.biomass).toBeGreaterThan(reports[i - 1]!.biomass);
    // No runaway: with the M1/M2 economy (no prestige yet) production stays far below the GDD's
    // end-of-week 1e12, which needs the multipliers of M5.
    expect(reports.at(-1)!.rate).toBeLessThan(1e6);
  }, 60_000);

  it("rewards activity without crushing the casual player (GDD pillar 2)", () => {
    const casual = get("casual").at(-1)!.biomass;
    const hardcore = get("hardcore").at(-1)!.biomass;
    const ratio = casual / hardcore;
    console.log(`casual / hardcore biomass at the end of the week: ${(ratio * 100).toFixed(1)} %`);
    expect(hardcore).toBeGreaterThan(casual);
    // PLACEHOLDER threshold: the casual player keeps at least a quarter of the active player's score.
    expect(ratio).toBeGreaterThan(0.25);
  }, 60_000);

  it("is deterministic", () => {
    const again = simulateWeek(PROFILES.casual, { days: 2 });
    const first = simulateWeek(PROFILES.casual, { days: 2 });
    expect(again).toEqual(first);
  }, 60_000);
});
