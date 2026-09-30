// Profile study: pnpm --filter @mycelium/shared simulate:profiles [--forests N] [--seed S] [--days D] [--step-min M] [--out dir]
// Plays N forests (default 4: every profile on every seat of one map). With --out, writes one JSON per
// forest (rows every 3 h, captures, daily maps) for charts and pictures.
import { mkdirSync, writeFileSync } from "node:fs";
import { formatProfileSummary, simulateProfiles, STUDY_PROFILES, summarizeProfiles, type ProfileSimResult } from "./profiles";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const forests = Number(arg("forests") ?? STUDY_PROFILES.length);
const seed = Number(arg("seed") ?? 20261005);
const days = Number(arg("days") ?? 7);
const stepMs = Number(arg("step-min") ?? 1) * 60_000;
const out = arg("out");
if (out) mkdirSync(out, { recursive: true });

const results: ProfileSimResult[] = [];
for (let f = 0; f < forests; f++) {
  const started = performance.now();
  // Every block of 4 forests plays one seed with the 4 rotations; the next block uses the next seed.
  const r = simulateProfiles({ seed: seed + Math.floor(f / STUDY_PROFILES.length), rotation: f, days, stepMs });
  results.push(r);
  if (out) writeFileSync(`${out}/forest-${f + 1}.json`, JSON.stringify(r));
  console.log(`forest ${f + 1}/${forests} (seed ${r.seed}, rotation ${f % STUDY_PROFILES.length}) in ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
console.log(formatProfileSummary(summarizeProfiles(results)));
