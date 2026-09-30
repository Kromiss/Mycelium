// Prints a forest week with robots: pnpm --filter @mycelium/shared simulate:forest [--json out.json]
import { writeFileSync } from "node:fs";
import { formatForestReport, simulateForestWeek } from "./forest-week";

const started = performance.now();
const result = simulateForestWeek();
console.log(`${formatForestReport(result)}\n(${((performance.now() - started) / 1000).toFixed(1)} s)`);
const out = process.argv.indexOf("--json");
if (out > 0 && process.argv[out + 1]) writeFileSync(process.argv[out + 1]!, JSON.stringify(result));
