import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Applies pending SQL migrations from ../migrations, in filename order, each in
 * its own transaction. Applied files are recorded in `schema_migrations`.
 * Migrations are forward-only: to undo something, write a new migration.
 */
export async function migrate(databaseUrl: string, dir: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    // Serialise concurrent runs (prod + a manual run, two staging deploys...).
    await client.query("select pg_advisory_lock(727274)");
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    await client.end();
  }
  return applied;
}

const isMain = process.argv[1] !== undefined && /migrate\.(ts|js|cjs)$/.test(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }
  const dir = process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, "../migrations");
  migrate(url, dir)
    .then((applied) => {
      console.log(applied.length ? `[migrate] ${applied.length} migration(s) applied` : "[migrate] up to date");
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
