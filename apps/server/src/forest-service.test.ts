import { describe, expect, it } from "vitest";
import { BORDERS, FOG_ENABLED, hexKey, OFFLINE, type ServerMessage } from "@mycelium/shared";
import { ForestService, type GameClient } from "./forest-service";
import { MemoryStore, type Account } from "./store";

const HOUR = 3_600_000;

class Spy implements GameClient {
  readonly messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

/** Thursday 8 October 2026, 10:00 Paris: an ordinary day of the season (PvP on, no modifier). */
const THURSDAY = Date.UTC(2026, 9, 8, 8);
/** Sunday 11 October 2026, 23:58 Paris: two minutes before the wipe. */
const SUNDAY_LATE = Date.UTC(2026, 9, 11, 21, 58);

async function setup(options: { capacity?: number; bots?: number; timeScale?: number; at?: number } = {}) {
  let real = options.at ?? THURSDAY;
  const store = new MemoryStore();
  const service = new ForestService(store, { now: () => real, capacity: options.capacity ?? 4, bots: options.bots, timeScale: options.timeScale, log: () => {} });
  await service.start({ tick: false });
  return { store, service, wait: (ms: number) => (real += ms) };
}

async function signUp(service: ForestService, name: string): Promise<{ token: string; account: Account }> {
  const res = await service.register(name, "correct horse");
  if (!res.ok) throw new Error(res.error);
  const account = (await service.authenticate(res.session.token))!;
  return { token: res.session.token, account };
}

async function play(service: ForestService, name: string) {
  const { account, token } = await signUp(service, name);
  const client = new Spy();
  expect(await service.attach(account, client)).toBe(true);
  return { account, client, token };
}

describe("accounts", () => {
  it("registers, logs in and out", async () => {
    const { service } = await setup();
    const reg = await service.register("  Kromiss ", "correct horse");
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.session.player.name).toBe("Kromiss");
    expect((await service.authenticate(reg.session.token))?.name).toBe("Kromiss");

    const login = await service.login("kromiss", "correct horse");
    expect(login.ok).toBe(true);
    expect(await service.login("kromiss", "wrong password")).toEqual({ ok: false, error: "wrong_credentials" });
    expect(await service.login("nobody", "correct horse")).toEqual({ ok: false, error: "wrong_credentials" });

    await service.logout(reg.session.token);
    expect(await service.authenticate(reg.session.token)).toBeNull();
  });

  it("refuses bad names, short passwords and taken names", async () => {
    const { service } = await setup();
    expect(await service.register("x", "correct horse")).toEqual({ ok: false, error: "invalid_name" });
    expect(await service.register("Hypha", "short")).toEqual({ ok: false, error: "weak_password" });
    await service.register("Hypha", "correct horse");
    expect(await service.register("HYPHA", "correct horse")).toEqual({ ok: false, error: "name_taken" });
  });

  it("slows down password guessing", async () => {
    const { service } = await setup();
    await service.register("Target", "correct horse");
    for (let i = 0; i < 10; i++) await service.login("Target", `guess ${i}`, "1.2.3.4");
    expect(await service.login("Target", "correct horse", "1.2.3.4")).toEqual({ ok: false, error: "too_many_attempts" });
  });

  it("lets a guest from M1–M2 choose a password", async () => {
    const { service, store } = await setup();
    const guest = await store.createAccount("OldGuest", null);
    await store.createSession(guest.id, (await import("./auth")).hashToken("legacy-token"));
    expect(await service.setPassword("legacy-token", "short")).toBe("weak_password");
    expect(await service.setPassword("legacy-token", "correct horse")).toBe("ok");
    expect(await service.setPassword("legacy-token", "another one")).toBe("already_set");
    expect((await service.login("OldGuest", "correct horse")).ok).toBe(true);
  });
});

describe("forests", () => {
  it("puts newcomers in the same forest until it is full", async () => {
    const { service } = await setup({ capacity: 2 });
    const a = await play(service, "Alpha");
    const b = await play(service, "Bravo");
    const c = await play(service, "Charlie");
    const fa = a.client.last("ready")!.forest;
    expect(b.client.last("ready")!.forest.id).toBe(fa.id);
    expect(c.client.last("ready")!.forest.id).not.toBe(fa.id);
    expect(c.client.last("ready")!.forest.number).toBe(fa.number + 1);
  });

  it("sends what the player can see, with the owners' names", async () => {
    const { service } = await setup();
    const a = await play(service, "Alpha");
    const ready = a.client.last("ready")!;
    // Without fog (FOG_ENABLED false), the whole forest; with it, the spawn and its neighbours.
    const forest = service.forestState(a.account.id)!;
    expect(ready.game.tiles.length).toBe(FOG_ENABLED ? 7 : forest.tiles.size);
    expect(ready.owners).toEqual([{ id: a.account.id, name: "Alpha", color: expect.any(Number), tiles: 1 }]);
    expect(ready.needsPassword).toBe(false);
    expect(ready.timeScale).toBe(1);
    expect(a.client.last("leaderboard")!.leaderboard.rank).toBe(1);
  });

  it("runs every economy on each tick, connected or not", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    const b = await play(service, "Bravo");
    await service.detach(b.account.id, b.client);
    wait(60_000);
    await service.tick();
    const forest = service.forestState(a.account.id)!;
    expect(forest.players.get(b.account.id)!.nutrients).toBeGreaterThan(10);
    const board = a.client.last("leaderboard")!.leaderboard;
    expect(board.players).toBe(2);
    expect(board.top.map((e) => e.name).sort()).toEqual(["Alpha", "Bravo"]);
    expect(board.global.players).toBe(2);
  });

  it("applies actions and reports errors", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    const forest = service.forestState(a.account.id)!;
    const spawn = forest.players.get(a.account.id)!.spawn;
    wait(60_000);
    await service.tick();
    const target = [...forest.tiles.values()].find(
      (t) => t.owner === null && t.terrain !== "wetland" && Math.abs(t.q - spawn.q) + Math.abs(t.r - spawn.r) + Math.abs(t.q + t.r - spawn.q - spawn.r) === 2,
    )!;
    forest.players.get(a.account.id)!.nutrients = 1e9; // Any neighbour is affordable.
    service.colonize(a.account.id, target.q, target.r, a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === target.q && t.r === target.r)?.owner).toBe(a.account.id);
    service.colonize(a.account.id, 99, 99, a.client);
    expect(a.client.last("actionError")?.error).toBe("unknown_tile");
    service.buyUpgrade(a.account.id, "teleport", a.client);
    expect(a.client.last("actionError")?.error).toBe("unknown_upgrade");
    service.build(a.account.id, spawn.q, spawn.r, "node", a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === spawn.q && t.r === spawn.r)?.s).toBe("node");
    service.build(a.account.id, spawn.q, spawn.r, "reservoir", a.client);
    expect(a.client.last("actionError")?.error).toBe("has_structure");
    service.demolish(a.account.id, spawn.q, spawn.r, a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === spawn.q && t.r === spawn.r)?.s).toBeUndefined();
    service.mutate(a.account.id, "digestiveEnzymes", a.client);
    expect(a.client.last("actionError")?.error).toBe("no_mutation_point");
    forest.players.get(a.account.id)!.biomass = 20_000;
    service.mutate(a.account.id, "digestiveEnzymes", a.client);
    expect(a.client.last("state")!.game.mutations).toEqual(["digestiveEnzymes"]);
    service.chooseStrain(a.account.id, "armillaria", a.client);
    expect(a.client.last("actionError")?.error).toBe("strain_chosen"); // It already owns a second tile.
    service.fructify(a.account.id, 2, a.client);
    expect(a.client.last("actionError")?.error).toBe("no_carpophore");
    service.buySporeUpgrade(a.account.id, "production", a.client);
    expect(a.client.last("actionError")?.error).toBe("not_enough_spores");
    service.setAutomation(a.account.id, { upgrades: true }, a.client);
    expect(a.client.last("actionError")?.error).toBe("locked");
    forest.players.get(a.account.id)!.biomass = 100_000;
    service.setAutomation(a.account.id, { colonize: "any" }, a.client);
    expect(a.client.last("state")!.game.automation).toEqual({ colonize: "any", upgrades: false });
    const stranger = new Spy();
    service.colonize(a.account.id, target.q, target.r, stranger);
    expect(stranger.last("actionError")?.error).toBe("not_authenticated");
  });

  it("enriches tiles and picks buds (M8)", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    const forest = service.forestState(a.account.id)!;
    const me = forest.players.get(a.account.id)!;
    const heart = me.heart;
    me.nutrients = 1e9;
    service.enrich(a.account.id, heart.q, heart.r, 10, a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === heart.q && t.r === heart.r)?.v).toBe(10);
    service.enrich(a.account.id, heart.q, heart.r, "max", a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === heart.q && t.r === heart.r)!.v).toBeGreaterThan(10);
    service.enrichBlock(a.account.id, heart.q, heart.r, a.client);
    service.enrich(a.account.id, 99, 99, 1, a.client);
    expect(a.client.last("actionError")?.error).toBe("unknown_tile");
    service.pickBud(a.account.id, heart.q, heart.r, a.client);
    expect(a.client.last("actionError")?.error).toBe("no_bud");
    // Buds grow within a few minutes and reach the client.
    wait(5 * 60_000);
    await service.tick();
    const buds = a.client.last("state")!.game.buds!;
    expect(buds.length).toBeGreaterThan(0);
    const before = me.nutrients;
    service.pickBud(a.account.id, buds[0]!.q, buds[0]!.r, a.client);
    expect(me.nutrients).toBeGreaterThan(before);
    expect(a.client.last("state")!.game.buds!.length).toBe(buds.length - 1);
  });

  it("summarises the absence when the player comes back", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    await service.detach(a.account.id, a.client);
    wait(10 * HOUR);
    await service.tick();
    const back = new Spy();
    await service.attach(a.account, back);
    const { away, game } = back.last("ready")!;
    expect(game.lastSeenAt).toBeNull();
    expect(away?.awayMs).toBe(10 * HOUR);
    expect(away!.nutrients).toBeLessThanOrEqual((8 + 2 * OFFLINE.reducedFactor) * 3600 + 1e-6);
    expect(away!.nutrients).toBeGreaterThan(3 * 3600);
    expect(away).toMatchObject({ won: 0, lost: 0 });
  });

  it("reports tiles taken at the border to both players", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    const b = await play(service, "Bravo");
    const forest = service.forestState(a.account.id)!;
    // Stage a border far from start zones: A's blob next to one of B's tiles.
    const pa = forest.players.get(a.account.id)!;
    const pb = forest.players.get(b.account.id)!;
    for (const t of forest.tiles.values()) {
      if (t.terrain === "wetland") t.terrain = "humus";
      t.owner = null;
    }
    pa.heart = { q: -2, r: 0 };
    for (const [q, r] of [[-2, 0], [-1, 0], [0, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [-2, 1], [-1, -1]]) forest.tiles.get(`${q},${r}`)!.owner = pa.id;
    pb.heart = { q: 3, r: 0 };
    // B keeps a tail out of reach, to stay above the floor of 7 tiles (M6).
    for (const [q, r] of [[3, 0], [2, 0], [1, 0], [4, 0], [5, 0], [4, -1], [5, -1], [6, -1]]) forest.tiles.get(`${q},${r}`)!.owner = pb.id;
    forest.tiles.get("1,0")!.terrain = "litter";
    (pa as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    (pb as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    // A Litter tile of the inner zone (M9: captures there take longer).
    for (let i = 0; i < 40 && forest.tiles.get("1,0")!.owner !== pa.id; i++) {
      wait(60_000);
      await service.tick();
    }
    expect(forest.tiles.get("1,0")!.owner).toBe(pa.id);
    const notices = [...a.client.messages, ...b.client.messages].flatMap((m) => (m.type === "state" ? m.events : []));
    expect(notices).toContainEqual({ q: 1, r: 0, kind: "won", other: pb.id });
    expect(notices).toContainEqual({ q: 1, r: 0, kind: "lost", other: pa.id });
    expect(hexKey({ q: 1, r: 0 })).toBe("1,0");
  });

  it("tells an absent player who took their tiles, and alerts the present ones (GDD §11)", async () => {
    const { service, wait } = await setup();
    const a = await play(service, "Alpha");
    const b = await play(service, "Bravo");
    const forest = service.forestState(a.account.id)!;
    const pa = forest.players.get(a.account.id)!;
    const pb = forest.players.get(b.account.id)!;
    for (const t of forest.tiles.values()) {
      if (t.terrain === "wetland") t.terrain = "humus";
      t.owner = null;
    }
    pa.heart = { q: -2, r: 0 };
    for (const [q, r] of [[-2, 0], [-1, 0], [0, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [-2, 1], [-1, -1]]) forest.tiles.get(`${q},${r}`)!.owner = pa.id;
    pb.heart = { q: 3, r: 0 };
    for (const [q, r] of [[3, 0], [2, 0], [1, 0], [4, 0], [5, 0], [4, -1], [5, -1], [6, -1]]) forest.tiles.get(`${q},${r}`)!.owner = pb.id;
    forest.tiles.get("1,0")!.terrain = "litter";
    (pa as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    (pb as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    await service.tick();
    // A present defender is warned when the neighbour starts pushing.
    wait(60_000);
    await service.tick();
    const alerts = b.client.messages.flatMap((m) => (m.type === "state" ? m.alerts : []));
    expect(alerts).toContainEqual({ type: "attacked", by: a.account.id, q: 1, r: 0 });
    // An action is reported to its victim on the next tick.
    pa.enzymesUnlocked = true;
    pa.enzymes = 100;
    service.act(a.account.id, "toxin", 1, 0, a.client);
    expect(a.client.last("actionError")).toBeUndefined();
    await service.tick();
    expect(b.client.last("state")!.alerts).toContainEqual({ type: "action", action: "toxin", by: a.account.id, q: 1, r: 0 });
    await service.detach(b.account.id, b.client);
    for (let i = 0; i < 40 && forest.tiles.get("1,0")!.owner !== pa.id; i++) {
      wait(60_000);
      await service.tick();
    }
    const back = new Spy();
    await service.attach(b.account, back);
    const journal = back.last("ready")!.away?.journal;
    expect(journal).toContainEqual({ type: "lostTo", name: "Alpha", tiles: 1 });
  });

  it("announces the season's events and runs the Dying tree (GDD §7)", async () => {
    // Thursday 13:00 Paris: the Dying tree of 14:00 is announced.
    const { service, wait } = await setup({ at: Date.UTC(2026, 9, 8, 10, 30) });
    const a = await play(service, "Alpha");
    await service.tick();
    wait(30 * 60_000);
    await service.tick();
    const state = a.client.last("state")!;
    const tree = state.forestEvents.find((e) => e.kind === "tree");
    expect(tree?.status).toBe("announced");
    expect(tree?.cells).toHaveLength(7);
    const notices = a.client.messages.flatMap((m) => (m.type === "state" ? m.eventNotices : []));
    expect(notices).toContainEqual(expect.objectContaining({ kind: "tree", phase: "announced" }));
    wait(HOUR);
    await service.tick();
    expect(a.client.last("state")!.forestEvents.find((e) => e.kind === "tree")?.status).toBe("active");
    expect(service.forestState(a.account.id)!.tiles.get(hexKey(tree!.cells[0]!))!.terrain).toBe("tree");
  });

  it("saves forests and finds players again after a restart", async () => {
    const { service, store, wait } = await setup();
    const a = await play(service, "Alpha");
    wait(60_000);
    await service.tick();
    await service.stop();
    const again = new ForestService(store, { now: () => THURSDAY + 3_600_000, log: () => {} });
    await again.start({ tick: false });
    const back = new Spy();
    expect(await again.attach((await again.authenticate(a.token))!, back)).toBe(true);
    expect(back.last("ready")!.forest.id).toBe(a.client.last("ready")!.forest.id);
    expect(back.last("ready")!.game.nutrients).toBeGreaterThan(10);
  });
});

describe("local testing helpers", () => {
  it("adds robots that play on their own", async () => {
    const { service, wait } = await setup({ capacity: 6, bots: 3 });
    const a = await play(service, "Alpha");
    for (let i = 0; i < 10; i++) {
      wait(60_000);
      await service.tick();
    }
    const forest = service.forestState(a.account.id)!;
    expect(forest.players.size).toBe(4);
    const board = a.client.last("leaderboard")!.leaderboard;
    expect(board.top.filter((e) => e.name.startsWith("Robot"))).toHaveLength(3);
    // Every robot is playing: it has colonised tiles or planned some (the map is random, so a
    // robot surrounded by expensive tiles may still be saving up).
    for (const p of forest.players.values()) {
      if (p.id === a.account.id) continue;
      const tiles = [...forest.tiles.values()].filter((t) => t.owner === p.id).length;
      expect(tiles > 1 || p.queue.length > 0).toBe(true);
    }
  });

  it("speeds up game time", async () => {
    const { service, wait } = await setup({ timeScale: 60 });
    const before = service.now();
    wait(1_000);
    expect(service.now() - before).toBe(60_000);
  });
});

describe("seasons (GDD §7, §8.2)", () => {
  it("freezes the score, archives the standings and wipes the forest on Monday", async () => {
    const { service, wait } = await setup({ at: SUNDAY_LATE });
    const a = await play(service, "Alpha");
    const b = await play(service, "Bravo");
    const forest = service.forestState(a.account.id)!;
    forest.players.get(a.account.id)!.biomass = 5_000;
    forest.players.get(b.account.id)!.biomass = 1_000;
    wait(90_000); // 23:59:30: frozen.
    await service.tick();
    const frozen = forest.players.get(a.account.id)!.biomass;
    wait(20_000);
    await service.tick();
    expect(forest.players.get(a.account.id)!.biomass).toBe(frozen);

    wait(20_000); // Monday 00:00:10: wiped.
    await service.tick();
    const ended = a.client.last("seasonEnded")!;
    expect(ended.result).toMatchObject({ week: 41, year: 2026, rank: 1, players: 2, seed: forest.seed });
    expect(b.client.last("seasonEnded")!.result).toMatchObject({ rank: 2 });
    expect(service.forestState(a.account.id)).toBeUndefined();
    service.colonize(a.account.id, 0, 0, a.client);
    expect(a.client.last("actionError")?.error).toBe("not_authenticated");

    // Coming back: a new forest of the new season, with the history and the Monday bonus.
    const back = new Spy();
    await service.attach(a.account, back);
    const ready = back.last("ready")!;
    expect(ready.forest.id).not.toBe(ended.result && a.client.last("ready")!.forest.id);
    expect(ready.forest.seasonStart).toBe(Date.UTC(2026, 9, 11, 22));
    expect(ready.history).toHaveLength(1);
    expect(ready.history[0]).toMatchObject({ rank: 1, forestNumber: a.client.last("ready")!.forest.number });
    expect(ready.game.mondayBonus).toBe(0.05); // 1st of 2 = top 50 %.
    expect(ready.game.biomass).toBe(0);
  });

  it("brings the robots back after the wipe", async () => {
    const { service, wait } = await setup({ at: SUNDAY_LATE, capacity: 6, bots: 2 });
    const a = await play(service, "Alpha");
    wait(3 * 60_000);
    await service.tick();
    await service.tick();
    const back = new Spy();
    await service.attach(a.account, back);
    const forest = service.forestState(a.account.id)!;
    expect(forest.players.size).toBe(3);
    expect(back.last("ready")!.forest.seasonStart).toBe(Date.UTC(2026, 9, 11, 22));
  });

  it("ends forests left over from a past season when the server starts", async () => {
    const { service, store, wait } = await setup({ at: SUNDAY_LATE });
    const a = await play(service, "Alpha");
    await service.stop();
    wait(3 * 3_600_000);
    const later = new ForestService(store, { now: () => SUNDAY_LATE + 3 * 3_600_000, log: () => {} });
    await later.start({ tick: false });
    expect(await store.listForests()).toEqual([]);
    expect(await store.seasonHistory(a.account.id, 5)).toHaveLength(1);
  });
});

