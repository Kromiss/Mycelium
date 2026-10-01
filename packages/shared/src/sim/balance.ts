/**
 * Balance simulation (roadmap M5: "no branch or strain dominates, and a well-timed fruiting pays"):
 * forests of 12 robots where every robot has one of the 12 strain × branch combinations. The same map
 * is played 12 times, the combinations shifting by one slice each time, so that every combination
 * plays every spot once and the map itself cancels out.
 * Used by `balance.test.ts` and `pnpm --filter @mycelium/shared simulate:balance`.
 */
import { MUTATION_BRANCHES, STRAIN_IDS, type MutationBranch, type StrainId } from "../balance";
import { simulateForestWeek, type ForestSimOptions } from "./forest-week";
import type { BotPlan } from "./week";

const BRANCHES = Object.keys(MUTATION_BRANCHES) as MutationBranch[];

/** The 12 combinations: a strain and a first branch (the two others follow in a fixed order). */
export const COMBOS: BotPlan[] = STRAIN_IDS.flatMap((strain) =>
  BRANCHES.map((first) => ({ strain, branches: [first, ...BRANCHES.filter((b) => b !== first)] })),
);

export interface BalanceOptions extends Pick<ForestSimOptions, "days" | "stepMs" | "decisionEveryMinutes"> {
  /** Forests to play; a multiple of 12 plays every combination in every slice of each map. */
  forests?: number;
  firstSeed?: number;
  /** Robots fruit at this hour with this radius (none by default). */
  fruit?: BotPlan["fruit"];
}

export interface BalanceRow {
  /** Average of (robot's final biomass / its forest's mean biomass). */
  share: number;
  /** Worst and best share seen. */
  min: number;
  max: number;
  /** Median share. */
  median: number;
  /** Average final rank (1 = first). */
  rank: number;
  /** Average tiles at the end. */
  tiles: number;
}

export interface BalanceReport {
  forests: number;
  byStrain: Record<StrainId, BalanceRow>;
  byBranch: Record<MutationBranch, BalanceRow>;
  byCombo: Record<string, BalanceRow>;
  /** Robots left with 3 tiles or fewer at the end. */
  eliminated: number;
}

export function simulateBalance(options: BalanceOptions = {}): BalanceReport {
  const { forests = 12, firstSeed = 20261100, days = 7, stepMs = 180_000, decisionEveryMinutes = 15, fruit } = options;
  const samples: Array<{ strain: StrainId; branch: MutationBranch; share: number; rank: number; tiles: number }> = [];
  let eliminated = 0;
  for (let f = 0; f < forests; f++) {
    const planOf = (i: number) => ({ ...COMBOS[(i + f) % COMBOS.length]!, fruit });
    const result = simulateForestWeek({ seed: firstSeed + Math.floor(f / COMBOS.length), days, stepMs, decisionEveryMinutes, planOf });
    const last = result.snapshots[result.snapshots.length - 1]!;
    const mean = last.players.reduce((s, p) => s + p.biomass, 0) / last.players.length;
    const ranked = [...last.players].sort((a, b) => b.biomass - a.biomass);
    for (const p of last.players) {
      samples.push({ strain: p.strain as StrainId, branch: p.branch as MutationBranch, share: p.biomass / mean, rank: ranked.indexOf(p) + 1, tiles: p.tiles });
      if (p.tiles <= 3) eliminated++;
    }
  }
  const row = (list: typeof samples): BalanceRow => ({
    share: list.reduce((s, x) => s + x.share, 0) / list.length,
    min: Math.min(...list.map((x) => x.share)),
    max: Math.max(...list.map((x) => x.share)),
    median: [...list].sort((a, b) => a.share - b.share)[Math.floor(list.length / 2)]!.share,
    rank: list.reduce((s, x) => s + x.rank, 0) / list.length,
    tiles: list.reduce((s, x) => s + x.tiles, 0) / list.length,
  });
  const group = <K extends string>(keys: readonly K[], pick: (x: (typeof samples)[number]) => K) =>
    Object.fromEntries(keys.map((k) => [k, row(samples.filter((x) => pick(x) === k))])) as Record<K, BalanceRow>;
  return {
    forests,
    byStrain: group(STRAIN_IDS, (x) => x.strain),
    byBranch: group(BRANCHES, (x) => x.branch),
    byCombo: group(
      COMBOS.map((c) => `${c.strain}/${c.branches[0]}`),
      (x) => `${x.strain}/${x.branch}`,
    ),
    eliminated,
  };
}

export function formatBalanceReport(r: BalanceReport): string {
  const line = (name: string, x: BalanceRow) =>
    `  ${name.padEnd(22)} share ${x.share.toFixed(2)}  median ${x.median.toFixed(2)}  (${x.min.toFixed(2)}..${x.max.toFixed(2)})  rank ${x.rank.toFixed(1).padStart(4)}  tiles ${x.tiles.toFixed(0).padStart(3)}`;
  return [
    `${r.forests} forests, ${r.eliminated} robots left with 3 tiles or fewer`,
    "by strain:",
    ...Object.entries(r.byStrain).map(([k, v]) => line(k, v)),
    "by first branch:",
    ...Object.entries(r.byBranch).map(([k, v]) => line(k, v)),
    "by combination:",
    ...Object.entries(r.byCombo).map(([k, v]) => line(k, v)),
  ].join("\n");
}
