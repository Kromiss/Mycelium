// Prints a forest week with robots:
//   pnpm --filter @mycelium/shared simulate:forest [--seed S] [--days D] [--stop ninety|full] [--json out.json]
// Another tile scale can be tried with the __TILE_SCALE__ global (see TILE_SCALE in balance.ts), other
// balance numbers with SIM_VARIANT (JSON, see variant.ts), e.g. SIM_VARIANT='{"ZONES":{"cost":[1,2,3,4,5,6,7]}}'.
// --summary out.json writes the measures of the M9 targets on one line, for scripts and the Simulate workflow.
import { writeFileSync } from "node:fs";
import { formatForestReport, scheduleGap, simulateForestWeek, zoneReach } from "./forest-week";
import { applyVariant, variantFromEnv } from "./variant";

const variant = variantFromEnv();
if (variant) applyVariant(variant);

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const seed = arg("seed") !== undefined ? Number(arg("seed")) : undefined;
const days = arg("days") !== undefined ? Number(arg("days")) : undefined;
const stop = arg("stop");
const stopAt = stop === "ninety" || stop === "full" ? stop : undefined;

const started = performance.now();
const result = simulateForestWeek({ seed, days, stopAt });
const seconds = (performance.now() - started) / 1000;
console.log(`${formatForestReport(result)}\n(${seconds.toFixed(1)} s)`);
const out = arg("json");
if (out) writeFileSync(out, JSON.stringify(result));
const summary = arg("summary");
if (summary) {
  // One line of JSON for scripts and CI: the measures of the M9 targets.
  writeFileSync(
    summary,
    JSON.stringify({ seed: seed ?? null, variant, seconds, filled: result.filled, gap: scheduleGap(result), zones: zoneReach(result), endHour: result.endHour }),
  );
}
