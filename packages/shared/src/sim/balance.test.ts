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
    for (const row of [...Object.values(report.byStrain), ...Object.values(report.byBranch)]) {
      expect(row.rank).toBeGreaterThan(5);
      expect(row.rank).toBeLessThan(8);
    }
    const spread = (rows: Array<{ rank: number }>) => Math.max(...rows.map((r) => r.rank)) - Math.min(...rows.map((r) => r.rank));
    expect(spread(Object.values(report.byStrain))).toBeLessThan(2);
    expect(spread(Object.values(report.byBranch))).toBeLessThan(2);
  }, 600_000);
});

describe("fruiting", () => {
  it("pays when the colony is big: fruiting on day 3 ends the week with more biomass", () => {
    const options = { stepMs: 600_000, decisionEveryMinutes: 30 } as const;
    const bot = 0;
    const base = simulateForestWeek({ ...options, planOf: () => NEUTRAL_PLAN });
    const fruiting = simulateForestWeek({ ...options, planOf: (i) => (i === bot ? { ...NEUTRAL_PLAN, fruit: { hour: 72, radius: 3 } } : NEUTRAL_PLAN) });
    const final = (r: typeof base) => r.snapshots[r.snapshots.length - 1]!.players.find((p) => p.id === "bot01")!.biomass;
    console.log(`bot01 final biomass: ${final(base).toExponential(3)} without fruiting, ${final(fruiting).toExponential(3)} with`);
    expect(final(fruiting) / final(base)).toBeGreaterThan(1.1);
  }, 300_000);
});
