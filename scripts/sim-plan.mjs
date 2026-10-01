// Plans the Simulate workflow: seeds and variants from the run's inputs, or from
// packages/shared/sim-matrix.json for a push on a sim/* branch. Prints GitHub outputs.
import { readFileSync } from "node:fs";

const file = JSON.parse(readFileSync(new URL("../packages/shared/sim-matrix.json", import.meta.url), "utf8"));
const env = (k) => (process.env[k] ?? "").trim();
const seeds = env("SEEDS") ? env("SEEDS").split(",").map((s) => Number(s.trim())) : file.seeds;
const variants = env("VARIANTS") ? JSON.parse(env("VARIANTS")) : file.variants;
const days = env("DAYS") || String(file.days ?? 7);
const stop = env("STOP") || file.stop || "";
if (!seeds.every(Number.isFinite)) throw new Error("Invalid seeds");
if (!Array.isArray(variants) || variants.some((v) => typeof v.name !== "string")) throw new Error("Invalid variants");
console.log(`seeds=${JSON.stringify(seeds)}`);
console.log(`variants=${JSON.stringify(variants)}`);
console.log(`days=${days}`);
console.log(`stop=${stop}`);
