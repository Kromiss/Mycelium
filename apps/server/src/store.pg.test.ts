import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advance, colonize, goOffline, moveHeart, newGame } from "@mycelium/shared";
import path from "node:path";
import pg from "pg";
import { migrate } from "./migrate";
import { NameTakenError, PgStore } from "./store";

// Runs only when a throwaway database is provided, e.g.
// TEST_DATABASE_URL=postgres://localhost/mycelium_test pnpm --filter @mycelium/server test
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PgStore", () => {
  let pool: pg.Pool;
  let store: PgStore;

  beforeAll(async () => {
    const admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query("drop schema public cascade; create schema public;");
    await admin.end();
    await migrate(url!, path.resolve(__dirname, "../migrations"));
    pool = new pg.Pool({ connectionString: url });
    store = new PgStore(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stores a new guest and loads the exact same game", async () => {
    const t0 = Date.UTC(2026, 8, 29, 12);
    const game = newGame(123456789, t0);
    const player = await store.createGuest("PgSpore", "hash-1", game);
    expect(await store.findPlayerByToken("hash-1")).toEqual(player);
    expect(await store.findPlayerByToken("hash-2")).toBeNull();
    expect(await store.loadGame(player.id)).toEqual(game);
  });

  it("refuses a taken name, case-insensitively", async () => {
    await expect(store.createGuest("pgspore", "hash-3", newGame(1, 0))).rejects.toBeInstanceOf(NameTakenError);
  });

  it("saves resources, upgrades and colonised tiles", async () => {
    const t0 = Date.UTC(2026, 8, 29, 13);
    const game = newGame(42, t0);
    const player = await store.createGuest("PgSaver", "hash-4", game);
    advance(game, t0 + 60_000);
    expect(colonize(game, { q: 0, r: 1 }, t0 + 60_000).ok).toBe(true);
    game.upgrades.digestion = 3;
    await store.saveGame(player.id, game);
    expect(await store.loadGame(player.id)).toEqual(game);

    colonize(game, { q: 0, r: 2 }, t0 + 60_000);
    advance(game, t0 + 600_000);
    expect(moveHeart(game, { q: 0, r: 1 }, t0 + 600_000).ok).toBe(true);
    game.nutrients = 0; // Keep the next tiles waiting in the queue.
    colonize(game, { q: 0, r: 3 }, t0 + 600_000);
    colonize(game, { q: 0, r: 4 }, t0 + 600_000);
    goOffline(game, t0 + 600_000);
    await store.saveGame(player.id, game);
    const loaded = await store.loadGame(player.id);
    expect(loaded).toEqual(game);
    expect(loaded!.tiles.get("0,1")!.growthEndsAt).toBeNull();
    expect(loaded!.tiles.get("0,1")!.exhaustion).toBeGreaterThan(0);
    expect(loaded!.queue.length).toBeGreaterThan(0);
  });
});
