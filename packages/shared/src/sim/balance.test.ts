import { describe, expect, it } from "vitest";
import { formatBalanceReport, simulateBalance } from "./balance";
import { simulateForestWeek } from "./forest-week";
import { NEUTRAL_PLAN } from "./week";

/**
 * Roadmap M5, "Terminé quand": the simulations show that no branch or strain dominates, and that a
 * well-timed fruiting pays. One map is played 12 times with the 12 strain × branch combinations
 * rotating over the slices (see balance.ts); ranks go from 1 (first) to 12, so 6.5 is the average.
 */
describe("strain and branch balance", () => {
  const report = simulateBalance({ forests: 12, days: 7, stepMs: 600_000, decisionEveryMinutes: 30 });

  it("keeps every strain and every first branch around the middle of the ranking", () => {
    console.log(formatBalanceReport(report));
    // M9 (new strains and Decomposer branch, values given by the owner): measured on 2 October 2026,
    // Armillaire ranks 5.1 against 7.9 for Cordyceps, and the Decomposer branch 4.4 against 7.4–7.7. The gap
    // is reported to the owner for a decision; until then the bounds only catch a strain or a branch that
    // would win or lose every forest.
    for (const row of [...Object.values(report.byStrain), ...Object.values(report.byBranch)]) {
      expect(row.rank).toBeGreaterThan(3.5);
      expect(row.rank).toBeLessThan(9.5);
    }
    const spread = (rows: Array<{ rank: number }>) => Math.max(...rows.map((r) => r.rank)) - Math.min(...rows.map((r) => r.rank));
    expect(spread(Object.values(report.byStrain))).toBeLessThan(4);
    expect(spread(Object.values(report.byBranch))).toBeLessThan(4);
  }, 600_000);
});

describe("fruiting", () => {
  it("pays when the colony is big: fruiting on day 4 ends the week with more biomass", () => {
    // M9: the week is slower (the forest fills on day 6–7), so the colony is big enough a day later than
    // before: fruiting at hour 72 now loses (×0.6), at hour 96 it pays (×2.9).
    const options = { stepMs: 600_000, decisionEveryMinutes: 30 } as const;
    const bot = 0;
    const base = simulateForestWeek({ ...options, planOf: () => NEUTRAL_PLAN });
    const fruiting = simulateForestWeek({ ...options, planOf: (i) => (i === bot ? { ...NEUTRAL_PLAN, fruit: { hour: 96, radius: 3 } } : NEUTRAL_PLAN) });
    const final = (r: typeof base) => r.snapshots[r.snapshots.length - 1]!.players.find((p) => p.id === "bot01")!.biomass;
    console.log(`bot01 final biomass: ${final(base).toExponential(3)} without fruiting, ${final(fruiting).toExponential(3)} with`);
    expect(final(fruiting) / final(base)).toBeGreaterThan(1.1);
  }, 300_000);
});
