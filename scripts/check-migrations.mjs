#!/usr/bin/env node
// CI guard for SQL migrations in apps/server/migrations:
//  - files must be named NNNN_description.sql, numbered 0001, 0002, ... with no gap or duplicate;
//  - destructive statements (DROP TABLE/COLUMN, TRUNCATE, DELETE FROM, ALTER COLUMN ... TYPE)
//    are refused unless the line carries an explicit `-- allow-destructive` comment.
// Applied migrations must never be edited: write a new one instead.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../apps/server/migrations");
const files = readdirSync(dir).filter((f) => !f.startsWith("."));
const errors = [];

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;
const numbers = [];
for (const file of files) {
  const m = NAME.exec(file);
  if (!m) {
    errors.push(`${file}: name must match NNNN_description.sql (lowercase, underscores)`);
    continue;
  }
  numbers.push(Number(m[1]));
}
numbers.sort((a, b) => a - b);
numbers.forEach((n, i) => {
  if (n !== i + 1) errors.push(`migration numbering must be 0001..${String(numbers.length).padStart(4, "0")} with no gap or duplicate (found ${String(n).padStart(4, "0")} at position ${i + 1})`);
});

const DESTRUCTIVE = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\balter\s+table\b[^;]*\bdrop\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+column\b[^;]*\btype\b/i,
];
for (const file of files.filter((f) => f.endsWith(".sql"))) {
  const lines = readFileSync(path.join(dir, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    const code = line.replace(/--.*$/, "");
    if (DESTRUCTIVE.some((re) => re.test(code)) && !/--\s*allow-destructive\b/.test(line)) {
      errors.push(`${file}:${i + 1}: destructive statement; add "-- allow-destructive" on the line if intended\n    ${line.trim()}`);
    }
  });
}

if (errors.length) {
  console.error(`Migration check failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Migration check passed (${files.length} file(s)).`);
