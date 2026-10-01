import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceForest, joinForest, newForest, refreshPacts, resolveBorders, scheduleEvents } from "@mycelium/shared";
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
    someTile.structure = "node";
    pa.enzymes = 42.5;
    pa.enzymesUnlocked = true;
    pa.strain = "truffle";
    pa.mutations = ["mycorrhiza", "mycelialCords"];
    pa.spores = 17;
    pa.sporeUpgrades.production = 2;
    pa.fruitings = 1;
    pa.automation = { colonize: "litter", upgrades: true };
    pa.cooldowns = { toxin: T0 + 7_200_000, cut: T0 + 9_000_000 };
    pa.heartShieldUntil = T0 + 86_400_000;
    someTile.effects = [{ kind: "siphon", by: b.id, until: T0 + 7_200_000 }];
    resolveBorders(forest, 5_000, T0 + 3_600_000);
    forest.events = scheduleEvents(99, SEASON);
    forest.events[0]!.status = "active";
    forest.events[0]!.damage = { [a.id]: 12.5 };
    // M7: pacts, Signals, relics and listening.
    forest.pacts.push({ id: "pact-1", members: [a.id, b.id], former: [], createdAt: T0, endedAt: null, leaving: { [b.id]: T0 + 3_600_000 }, marks: { [a.id]: 1, [b.id]: 2 }, banked: 5 });
    forest.invites.push({ from: b.id, to: a.id, at: T0 });
    refreshPacts(forest);
    pa.taintedUntil = T0 + 86_400_000;
    pa.signals = 3.5;
    pa.signalsUnlocked = true;
    pa.relics = ["vigour"];
    pa.relicPicks = 1;
    pa.listens = { [b.id]: T0 + 7_200_000 };
    // M8: enrichment levels and buds.
    someTile.level = 12;
    pa.buds = [{ q: someTile.q, r: someTile.r, until: T0 + 3_700_000 }];
    pa.nextBudAt = T0 + 3_780_000;
    await store.saveForest(record.id, forest);

    expect(await store.listForests()).toContainEqual(record);
    const loaded = (await store.loadForest(record.id))!;
    expect(loaded.record).toEqual(record);
    expect([...loaded.members.values()].map((m) => m.name).sort()).toEqual([`Cleo${_name}`, `Dan${_name}`].sort());
    expect(loaded.members.get(b.id)?.isBot).toBe(true);
    expect(loaded.forest.tiles).toEqual(forest.tiles);
    expect(loaded.forest.spawns).toEqual(forest.spawns);
    expect(loaded.forest.events).toEqual(forest.events);
    expect(loaded.forest.pacts).toEqual(forest.pacts);
    expect(loaded.forest.invites).toEqual(forest.invites);
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
        { playerId: b.id, rank: 1, players: 2, biomass: 900, trophies: 3, tiles: 40, conquests: 3, boss: 12.5, activeMs: 7_200_000, fruitings: 2, leagueBefore: 0, leagueAfter: 1 },
        { playerId: a.id, rank: 2, players: 2, biomass: 500, trophies: 0, tiles: 30, conquests: 0, boss: 0, activeMs: 0, fruitings: 1, leagueBefore: 1, leagueAfter: 0 },
      ],
      SEASON + 7 * 86_400_000,
      [
        { playerId: b.id, kind: "title", id: "champion" },
        { playerId: b.id, kind: "color", id: "gold" },
        { playerId: a.id, kind: "title", id: "bronze" },
      ],
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
        conquests: 0,
        boss: 0,
        activeMs: 0,
        league: { before: 1, after: 0 },
        rewards: [{ kind: "title", id: "bronze" }],
      },
    ]);
    // M7: leagues, rewards, cosmetics and career.
    expect((await store.findAccountByName(`Finn${_name}`))?.league).toBe(1);
    expect((await store.findAccountByName(`Eve${_name}`))?.league).toBe(0);
    expect(await store.rewardsOf(b.id)).toEqual(expect.arrayContaining([{ kind: "title", id: "champion" }, { kind: "color", id: "gold" }]));
    await store.setCosmetic(b.id, "title", "champion");
    await store.setCosmetic(b.id, "color", "gold");
    const finn = (await store.findAccountByName(`Finn${_name}`))!;
    expect([finn.title, finn.color, finn.skin]).toEqual(["champion", "gold", null]);
    expect(await store.careerOf(b.id)).toEqual({ seasons: 1, fruitings: 2, trophies: 3, bestRank: 1 });
    expect(await store.careerOf("00000000-0000-0000-0000-000000000000")).toEqual({ seasons: 0, fruitings: 0, trophies: 0, bestRank: null });
    await store.setLeague(a.id, 3);
    expect((await store.findAccountByName(`Eve${_name}`))?.league).toBe(3);
    // Ending twice changes nothing.
    await store.endForest(record.id, [], SEASON + 7 * 86_400_000);
    expect(await store.seasonHistory(b.id, 5)).toHaveLength(1);
  });

  it("keeps chat messages, reports, mutes and silences", async () => {
    const store = make();
    const forest = newForest(7, T0, 4);
    const record = await store.createForest(forest, SEASON);
    const a = await store.createAccount(`Gus${_name}`, "hash");
    const b = await store.createAccount(`Hana${_name}`, "hash");
    const m1 = await store.addChat({ forestId: record.id, channel: "forest", pact: null, from: a.id, to: null, text: "hello", at: T0 });
    const m2 = await store.addChat({ forestId: record.id, channel: "dm", pact: null, from: a.id, to: b.id, text: "psst", at: T0 + 1 });
    const m3 = await store.addChat({ forestId: record.id, channel: "pact", pact: "p1", from: b.id, to: null, text: "allies", at: T0 + 2 });
    expect(m1).toEqual({ id: m1.id, channel: "forest", pact: null, from: a.id, fromName: `Gus${_name}`, at: T0, text: "hello" });
    expect(m2.to).toBe(b.id);
    expect((await store.chatHistory(record.id, 10)).map((m) => m.text)).toEqual(["hello", "psst", "allies"]);
    expect((await store.chatHistory(record.id, 2)).map((m) => m.text)).toEqual(["psst", "allies"]);
    expect(await store.findChat(m3.id)).toEqual({ ...m3, forestId: record.id });
    expect(await store.findChat(999_999)).toBeNull();
    await store.reportChat(m1.id, b.id);
    await store.reportChat(m1.id, b.id);

    await store.setMute(b.id, a.id, true);
    await store.setMute(b.id, a.id, true);
    expect(await store.mutedBy(b.id)).toEqual([a.id]);
    await store.setMute(b.id, a.id, false);
    expect(await store.mutedBy(b.id)).toEqual([]);

    await store.silence(a.id, T0 + 86_400_000);
    expect((await store.findAccountByName(`Gus${_name}`))?.silencedUntil).toBe(T0 + 86_400_000);
  });

  it("keeps push subscriptions and settings", async () => {
    const store = make();
    const a = await store.createAccount(`Ivy${_name}`, "hash");
    const b = await store.createAccount(`Jo${_name}`, "hash");
    const sub = { endpoint: `https://push.example/${_name}`, playerId: a.id, p256dh: "k", auth: "x", lang: "fr" as const, kinds: ["dm" as const] };
    await store.savePushSubscription(sub);
    await store.savePushSubscription({ ...sub, kinds: ["dm", "boss"] });
    expect(await store.pushSubscriptions(a.id)).toEqual([{ ...sub, kinds: ["dm", "boss"] }]);
    // Somebody else cannot remove it.
    await store.removePushSubscription(sub.endpoint, b.id);
    expect(await store.pushSubscriptions(a.id)).toHaveLength(1);
    await store.removePushSubscription(sub.endpoint, a.id);
    expect(await store.pushSubscriptions(a.id)).toEqual([]);

    expect(await store.getSetting(`k${_name}`)).toBeNull();
    await store.setSetting(`k${_name}`, "1");
    await store.setSetting(`k${_name}`, "2");
    expect(await store.getSetting(`k${_name}`)).toBe("2");
  });
});
