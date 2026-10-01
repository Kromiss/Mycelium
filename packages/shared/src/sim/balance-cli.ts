// Prints the strain / branch balance:
// pnpm --filter @mycelium/shared simulate:balance [forests] [firstSeed] [fruitHour fruitRadius]
import { formatBalanceReport, simulateBalance } from "./balance";
import { applyVariant, variantFromEnv } from "./variant";

// Balance numbers changed for this run (SIM_VARIANT, JSON; see variant.ts).
const variant = variantFromEnv();
if (variant) applyVariant(variant);

const started = performance.now();
const [forests = 12, firstSeed = 20261100, fruitHour, fruitRadius = 3] = process.argv.slice(2).map(Number);
const fruit = fruitHour !== undefined ? { hour: fruitHour, radius: fruitRadius } : undefined;
console.log(`${formatBalanceReport(simulateBalance({ forests, firstSeed, fruit }))}\n(${((performance.now() - started) / 1000).toFixed(1)} s)`);
