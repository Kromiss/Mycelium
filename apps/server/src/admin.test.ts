import { describe, expect, it } from "vitest";
import { TEST_FOREST_PRESETS, type AdminOp, type AdminState, type ServerMessage, type TestForestSettings } from "@mycelium/shared";
import { ForestService, type GameClient } from "./forest-service";
import { loadConfig } from "./config";
import { MemoryStore } from "./store";

const HOUR = 3_600_000;
/** Thursday 8 October 2026, 10:00 Paris. */
const THURSDAY = Date.UTC(2026, 9, 8, 8);

class Spy implements GameClient {
  readonly messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

async function setup(options: { adminTools?: boolean } = {}) {
  let real = THURSDAY;
  const store = new MemoryStore();
  const service = new ForestService(store, { now: () => real, capacity: 4, admins: ["Boss"], adminTools: options.adminTools ?? true, log: () => {} });
  await service.start({ tick: false });
  const join = async (name: string) => {
    const res = await service.register(name, "correct horse");
    if (!res.ok) throw new Error(res.error);
    const account = (await service.authenticate(res.session.token))!;
    const client = new Spy();
    expect(await service.attach(account, client)).toBe(true);
    return { account, client };
  };
  return { store, service, join, wait: (ms: number) => (real += ms) };
}

const settings = (over: Partial<TestForestSettings> = {}): TestForestSettings => ({ name: "Essai", ...TEST_FOREST_PRESETS.week, seed: 20261002, capacity: 4, bots: 2, timeScale: 60, ...over });

async function admin(service: ForestService, id: string, client: Spy, op: AdminOp): Promise<AdminState> {
  await service.admin(id, op, client);
  return client.last("admin")!.state;
}

describe("admin tools (M9)", () => {
  it("are off in production, on in local development and on staging", () => {
    expect(loadConfig({ NODE_ENV: "production" }).adminTools).toBe(false);
    expect(loadConfig({ NODE_ENV: "production", ADMIN_TOOLS: "1" }).adminTools).toBe(false);
    expect(loadConfig({ NODE_ENV: "production", DEPLOY_ENV: "staging" }).adminTools).toBe(true);
    expect(loadConfig({}).adminTools).toBe(true);
    expect(loadConfig({ ADMIN_TOOLS: "0" }).adminTools).toBe(false);
  });

  it("refuse everyone but admins, and everything when the tools are off", async () => {
    const { service, join } = await setup();
    const player = await join("Player");
    await service.admin(player.account.id, { op: "list" }, player.client);
    expect(player.client.last("adminError")?.error).toBe("forbidden");
    expect(player.client.last("ready")!.adminTools).toBeUndefined();
    const off = await setup({ adminTools: false });
    const boss = await off.join("Boss");
    await off.service.admin(boss.account.id, { op: "create", settings: settings() }, boss.client);
    expect(boss.client.last("adminError")?.error).toBe("forbidden");
    expect(boss.client.last("ready")!.adminTools).toBeUndefined();
  });

  it("create a test forest with its robots, on its own clock, out of every leaderboard", async () => {
    const { service, join, wait } = await setup();
    const boss = await join("Boss");
    expect(boss.client.last("ready")!.adminTools).toBe(true);
    const state = await admin(service, boss.account.id, boss.client, { op: "create", settings: settings({ withMe: false, startDay: 1 }) });
    expect(state.forests).toHaveLength(1);
    const forest = state.forests[0]!;
    expect(forest.players.filter((p) => p.bot)).toHaveLength(2);
    // Tuesday 00:00 of this week, then ×60: a real minute is an hour of game.
    const opened = forest.gameTime;
    expect(new Date(opened).getUTCDay()).toBe(1);
    wait(60_000);
    await service.tick();
    const after = (await admin(service, boss.account.id, boss.client, { op: "list" })).forests[0]!;
    expect(after.gameTime - opened).toBe(HOUR);
    // The robots play.
    expect(after.players.every((p) => p.tiles > 1)).toBe(true);
    expect(after.apm.bots).toBeGreaterThan(0);
    // The admin's own forest did not move faster.
    expect(boss.client.last("state")!.serverTime).toBe(THURSDAY + 60_000);
  });

  it("pause, resume, speed up, jump to a day and erase a test forest", async () => {
    const { service, join, wait } = await setup();
    const boss = await join("Boss");
    const id = (await admin(service, boss.account.id, boss.client, { op: "create", settings: settings({ withMe: false }) })).forests[0]!.id;
    let f = (await admin(service, boss.account.id, boss.client, { op: "pause", forest: id })).forests[0]!;
    expect(f.status).toBe("paused");
    const frozen = f.gameTime;
    wait(60_000);
    await service.tick();
    expect((await admin(service, boss.account.id, boss.client, { op: "list" })).forests[0]!.gameTime).toBe(frozen);
    await admin(service, boss.account.id, boss.client, { op: "resume", forest: id });
    await admin(service, boss.account.id, boss.client, { op: "speed", forest: id, timeScale: 120 });
    wait(60_000);
    await service.tick();
    expect((await admin(service, boss.account.id, boss.client, { op: "list" })).forests[0]!.gameTime).toBe(frozen + 2 * HOUR);
    // Jump to Wednesday: simulated in the background, the forest is busy meanwhile.
    f = (await admin(service, boss.account.id, boss.client, { op: "jump", forest: id, day: 2 })).forests[0]!;
    expect(f.status).toBe("jumping");
    await admin(service, boss.account.id, boss.client, { op: "jump", forest: id, day: 3 });
    expect(boss.client.last("adminError")?.error).toBe("busy");
    for (let i = 0; i < 200 && f.status === "jumping"; i++) {
      await new Promise((resolve) => setImmediate(resolve));
      f = (await admin(service, boss.account.id, boss.client, { op: "list" })).forests[0]!;
    }
    expect(f.status).toBe("running");
    expect(f.day).toBe(2);
    expect(f.occupancy).toBeGreaterThan(0);
    // Back in time: refused.
    await admin(service, boss.account.id, boss.client, { op: "jump", forest: id, day: 0 });
    expect(boss.client.last("adminError")?.error).toBe("invalid");
    expect((await admin(service, boss.account.id, boss.client, { op: "erase", forest: id })).forests).toHaveLength(0);
  });

  it("let the admin play in a test forest, give themselves resources and come back", async () => {
    const { service, join } = await setup();
    const boss = await join("Boss");
    const home = boss.client.last("ready")!.forest.id;
    const state = await admin(service, boss.account.id, boss.client, { op: "create", settings: settings() });
    expect(state.playing).toBe(state.forests[0]!.id);
    expect(boss.client.last("adminSwitch")).toBeDefined();
    // The client reconnects: it gets the test forest.
    const again = new Spy();
    await service.attach(boss.account, again);
    expect(again.last("ready")!.forest.test).toBe("Essai");
    const before = again.last("ready")!.game.nutrients;
    await service.admin(boss.account.id, { op: "give", nutrients: 1e6, enzymes: 50 }, again);
    expect(again.last("state")!.game.nutrients).toBeGreaterThanOrEqual(before + 1e6);
    expect(again.last("state")!.game.enzymesUnlocked).toBe(true);
    // Back home: no more gifts.
    await service.admin(boss.account.id, { op: "play", forest: null }, again);
    const home2 = new Spy();
    await service.attach(boss.account, home2);
    expect(home2.last("ready")!.forest.id).toBe(home);
    await service.admin(boss.account.id, { op: "give", nutrients: 1 }, home2);
    expect(home2.last("adminError")?.error).toBe("not_playing");
  });

  it("let the admin watch a robots-only forest through a robot's eyes, without acting", async () => {
    const { service, join, wait } = await setup();
    const boss = await join("Boss");
    const state = await admin(service, boss.account.id, boss.client, { op: "create", settings: settings({ bots: 4, robotsOnly: true, withMe: false }) });
    const f = state.forests[0]!;
    await admin(service, boss.account.id, boss.client, { op: "play", forest: f.id });
    expect(boss.client.last("adminError")?.error).toBe("invalid");
    const bot = f.players[1]!;
    const following = await admin(service, boss.account.id, boss.client, { op: "follow", forest: f.id, bot: bot.id });
    expect(following.following).toEqual({ forest: f.id, bot: bot.id });
    const eyes = new Spy();
    await service.attach(boss.account, eyes);
    expect(eyes.last("ready")!.spectating).toBe(bot.name);
    expect(eyes.last("ready")!.game.id).toBe(bot.id);
    service.buyUpgrade(boss.account.id, "digestion", eyes);
    expect(eyes.last("actionError")?.error).toBe("spectating");
    wait(30_000);
    await service.tick();
    expect(eyes.last("state")!.game.id).toBe(bot.id);
    await service.admin(boss.account.id, { op: "follow", forest: null }, eyes);
    const back = new Spy();
    await service.attach(boss.account, back);
    expect(back.last("ready")!.spectating).toBeUndefined();
  });
});

describe("states (M9)", () => {
  it("only carry the tiles that changed since the client's last message", async () => {
    const { service, join, wait } = await setup();
    const a = await join("Alpha");
    const all = a.client.last("ready")!.game.tiles.length;
    wait(5_000);
    await service.tick();
    const first = a.client.last("state")!;
    expect(first.delta).toBe(true);
    expect(first.game.tiles.length).toBeLessThan(all / 10);
    // A new tab gets everything, then deltas too.
    const b = new Spy();
    await service.attach(a.account, b);
    expect(b.last("ready")!.game.tiles).toHaveLength(all);
    service.colonize(a.account.id, 0, 0, a.client);
    wait(5_000);
    await service.tick();
    expect(b.last("state")!.game.tiles.length).toBeLessThan(all / 10);
  });
});
