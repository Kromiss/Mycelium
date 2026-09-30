import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceForest, joinForest, newForest, resolveBorders } from "@mycelium/shared";
import path from "node:path";
import pg from "pg";
import { migrate } from "./migrate";
import { MemoryStore, NameTakenError, PgStore, type GameStore } from "./store";

// The Postgres store runs only when a throwaway database is provided, e.g.
// TEST_DATABASE_URL=postgres://localhost/mycelium_test pnpm --filter @mycelium/server test
// (the database is wiped first). The memory store always runs the same contract.
const url = process.env.TEST_DATABASE_URL;
const T0 = Date.UTC(2026, 9, 5, 12);
/** Monday 5 October 2026, 00:00 Paris. */
const SEASON = Date.UTC(2026, 9, 4, 22);

let pool: pg.Pool | undefined;

beforeAll(async () => {
  if (!url) return;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query("drop schema public cascade; create schema public;");
  await admin.end();
  await migrate(url, path.resolve(__dirname, "../migrations"));
  pool = new pg.Pool({ connectionString: url });
});

afterAll(async () => {
  await pool?.end();
});

const stores: Array<[string, () => GameStore]> = [["memory", () => new MemoryStore()]];
if (url) stores.push(["postgres", () => new PgStore(pool!)]);

describe.each(stores)("%s store", (_name, make) => {
  it("creates accounts with unique names and finds them", async () => {
    const store = make();
    const a = await store.createAccount(`Alice${_name}`, "hash");
    expect(await store.findAccountByName(`alice${_name}`)).toEqual(a);
    await expect(store.createAccount(`ALICE${_name}`, "x")).rejects.toBeInstanceOf(NameTakenError);
    await store.setPassword(a.id, "other");
    expect((await store.findAccountByName(`Alice${_name}`))?.passwordHash).toBe("other");
  });

  it("opens and closes sessions", async () => {
    const store = make();
    const a = await store.createAccount(`Bob${_name}`, "hash");
    await store.createSession(a.id, `tok-${_name}`);
    expect((await store.findAccountBySession(`tok-${_name}`))?.id).toBe(a.id);
    await store.deleteSession(`tok-${_name}`);
    expect(await store.findAccountBySession(`tok-${_name}`)).toBeNull();
  });

  it("saves and reloads a whole forest", async () => {
    const store = make();
    const forest = newForest(99, T0, 4);
    const record = await store.createForest(forest, SEASON);
    const a = await store.createAccount(`Cleo${_name}`, "hash");
    const b = await store.createAccount(`Dan${_name}`, null, true);
    joinForest(forest, a.id, T0);
    joinForest(forest, b.id, T0);
    advanceForest(forest, T0 + 3_600_000);
    const pa = forest.players.get(a.id)!;
    pa.queue.push({ q: 0, r: 0 });
    pa.trophies = 2;
    const someTile = [...forest.tiles.values()].find((t) => t.owner === a.id)!;
    someTile.capture = { by: b.id, progress: 0.25 };
    resolveBorders(forest, 5_000, T0 + 3_600_000);
    await store.saveForest(record.id, forest);

    expect(await store.listForests()).toContainEqual(record);
    const loaded = (await store.loadForest(record.id))!;
    expect(loaded.record).toEqual(record);
    expect([...loaded.members.values()].map((m) => m.name).sort()).toEqual([`Cleo${_name}`, `Dan${_name}`].sort());
    expect(loaded.members.get(b.id)?.isBot).toBe(true);
    expect(loaded.forest.tiles).toEqual(forest.tiles);
    expect(loaded.forest.spawns).toEqual(forest.spawns);
    for (const [id, p] of forest.players) {
      const q = loaded.forest.players.get(id)!;
      expect(q.tiles).toBe(loaded.forest.tiles);
      expect({ ...q, tiles: null }).toEqual({ ...p, tiles: null });
    }
  });

  it("ends a forest, keeps the standings and the published seed", async () => {
    const store = make();
    const forest = newForest(4242, T0, 4);
    const record = await store.createForest(forest, SEASON);
    const a = await store.createAccount(`Eve${_name}`, "hash");
    const b = await store.createAccount(`Finn${_name}`, "hash");
    joinForest(forest, a.id, T0);
    joinForest(forest, b.id, T0);
    forest.players.get(a.id)!.mondayBonus = 0.05;
    await store.saveForest(record.id, forest);
    expect((await store.loadForest(record.id))!.forest.players.get(a.id)!.mondayBonus).toBe(0.05);

    await store.endForest(
      record.id,
      [
        { playerId: b.id, rank: 1, players: 2, biomass: 900, trophies: 3, tiles: 40 },
        { playerId: a.id, rank: 2, players: 2, biomass: 500, trophies: 0, tiles: 30 },
      ],
      SEASON + 7 * 86_400_000,
    );
    expect((await store.listForests()).map((f) => f.id)).not.toContain(record.id);
    expect(await store.loadForest(record.id)).toBeNull();
    const history = await store.seasonHistory(a.id, 5);
    expect(history).toEqual([
      {
        seasonStart: SEASON,
        week: 41,
        year: 2026,
        forestNumber: record.number,
        rank: 2,
        players: 2,
        biomass: 500,
        trophies: 0,
        tiles: 30,
        seed: 4242,
      },
    ]);
    // Ending twice changes nothing.
    await store.endForest(record.id, [], SEASON + 7 * 86_400_000);
    expect(await store.seasonHistory(b.id, 5)).toHaveLength(1);
  });
});
