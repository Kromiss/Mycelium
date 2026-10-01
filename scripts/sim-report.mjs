// Markdown table of the Simulate workflow's results (one summary.json per run, in sub-folders).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "results";
const rows = [];
for (const sub of existsSync(dir) ? readdirSync(dir) : []) {
  const file = join(dir, sub, "summary.json");
  if (existsSync(file)) rows.push(JSON.parse(readFileSync(file, "utf8")));
}
const day = (h) => (h === null || h === undefined ? "—" : (h / 24).toFixed(1));
const profiles = [...new Set(rows.flatMap((r) => Object.keys(r.zones ?? {})))];
console.log("## Forest simulations\n");
console.log(`| variant | seed | 90 % (day) | full (day) | gap | ${profiles.map((p) => `first in zones 1→7 (${p})`).join(" | ")} | time |`);
console.log(`|---|---|---|---|---|${profiles.map(() => "---").join("|")}|---|`);
rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.seed - b.seed);
for (const r of rows) {
  const zones = profiles.map((p) => (r.zones?.[p]?.first ?? r.zones?.[p] ?? []).map(day).join(" / "));
  console.log(`| ${r.name ?? ""} | ${r.seed} | ${day(r.filled?.ninety)} | ${day(r.filled?.full)} | ×${r.gap?.ratio?.toFixed(1)} | ${zones.join(" | ")} | ${r.seconds?.toFixed(0)} s |`);
}
// Averages by variant.
const byName = new Map();
for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
console.log("\n| variant | runs | mean 90 % (day) | mean gap |\n|---|---|---|---|");
for (const [name, list] of byName) {
  const ninety = list.map((r) => r.filled?.ninety).filter((h) => h !== null && h !== undefined);
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  console.log(`| ${name} | ${list.length} | ${day(mean(ninety))} (${ninety.length}/${list.length}) | ×${mean(list.map((r) => r.gap?.ratio ?? 0))?.toFixed(1)} |`);
}
