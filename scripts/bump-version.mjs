#!/usr/bin/env node
// Sets the same version in every package.json of the monorepo.
// Usage: pnpm version:bump 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: pnpm version:bump X.Y.Z");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const files = ["package.json", "packages/shared/package.json", "apps/server/package.json", "apps/web/package.json"];
for (const rel of files) {
  const file = path.join(root, rel);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${rel} -> ${version}`);
}
console.log('Next: add a "## [' + version + '] - YYYY-MM-DD" entry to CHANGELOG.md.');
