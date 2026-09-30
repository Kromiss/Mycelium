import { describe, expect, it } from "vitest";
import { BORDERS, hexKey, OFFLINE, type ServerMessage } from "@mycelium/shared";
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

async function setup(options: { capacity?: number; bots?: number; timeScale?: number } = {}) {
  let real = Date.UTC(2026, 9, 5, 8);
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

  it("sends only what the player can see, with the owners' names", async () => {
    const { service } = await setup();
    const a = await play(service, "Alpha");
    const ready = a.client.last("ready")!;
    expect(ready.game.tiles.length).toBe(7); // Spawn and its neighbours.
    expect(ready.owners).toEqual([{ id: a.account.id, name: "Alpha", color: expect.any(Number) }]);
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
    service.colonize(a.account.id, target.q, target.r, a.client);
    expect(a.client.last("state")!.game.tiles.find((t) => t.q === target.q && t.r === target.r)?.owner).toBe(a.account.id);
    service.colonize(a.account.id, 99, 99, a.client);
    expect(a.client.last("actionError")?.error).toBe("unknown_tile");
    service.buyUpgrade(a.account.id, "teleport", a.client);
    expect(a.client.last("actionError")?.error).toBe("unknown_upgrade");
    const stranger = new Spy();
    service.colonize(a.account.id, target.q, target.r, stranger);
    expect(stranger.last("actionError")?.error).toBe("not_authenticated");
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
    expect(away!.nutrients).toBeLessThan((8 + 2 * OFFLINE.reducedFactor) * 3600);
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
    for (const [q, r] of [[3, 0], [2, 0], [1, 0]]) forest.tiles.get(`${q},${r}`)!.owner = pb.id;
    forest.tiles.get("1,0")!.terrain = "litter";
    (pa as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    (pb as { joinedAt: number }).joinedAt -= 2 * BORDERS.protectedMs;
    for (let i = 0; i < 12; i++) {
      wait(60_000);
      await service.tick();
    }
    expect(forest.tiles.get("1,0")!.owner).toBe(pa.id);
    const notices = [...a.client.messages, ...b.client.messages].flatMap((m) => (m.type === "state" ? m.events : []));
    expect(notices).toContainEqual({ q: 1, r: 0, kind: "won", other: pb.id });
    expect(notices).toContainEqual({ q: 1, r: 0, kind: "lost", other: pa.id });
    expect(hexKey({ q: 1, r: 0 })).toBe("1,0");
  });

  it("saves forests and finds players again after a restart", async () => {
    const { service, store, wait } = await setup();
    const a = await play(service, "Alpha");
    wait(60_000);
    await service.tick();
    await service.stop();
    const again = new ForestService(store, { now: () => Date.UTC(2026, 9, 5, 9), log: () => {} });
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
