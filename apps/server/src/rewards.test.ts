import { describe, expect, it } from "vitest";
import { type ServerMessage } from "@mycelium/shared";
import { ForestService, type GameClient } from "./forest-service";
import { MemoryStore } from "./store";

class Spy implements GameClient {
  readonly messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

/** Sunday 11 October 2026, 23:58 Paris: two minutes before the wipe. */
const SUNDAY_LATE = Date.UTC(2026, 9, 11, 21, 58);
const WEEK = 7 * 86_400_000;

async function setup(capacity = 4) {
  let real = SUNDAY_LATE;
  const store = new MemoryStore();
  const service = new ForestService(store, { now: () => real, capacity, log: () => {} });
  await service.start({ tick: false });
  const play = async (name: string) => {
    const res = await service.register(name, "correct horse");
    if (!res.ok) throw new Error(res.error);
    const account = (await service.authenticate(res.session.token))!;
    const client = new Spy();
    expect(await service.attach(account, client)).toBe(true);
    return { id: account.id, account, client, token: res.session.token };
  };
  return { store, service, play, wait: (ms: number) => (real += ms) };
}

describe("season rewards and leagues (M7)", () => {
  it("rank territory, conquests and efficiency live, and reward the winners after the wipe", async () => {
    const { service, play, wait } = await setup();
    const players = await Promise.all(["Alpha", "Bravo", "Charlie", "Delta"].map((n) => play(n)));
    const [a, b, c, d] = players;
    const forest = service.forestState(a!.id)!;
    [5_000, 3_000, 2_000, 1_000].forEach((bio, i) => (forest.players.get(players[i]!.id)!.biomass = bio));
    forest.players.get(b!.id)!.conquests = 4;
    forest.players.get(c!.id)!.activeMs = 2 * 3_600_000;
    await service.tick();
    const board = a!.client.last("leaderboard")!.leaderboard;
    expect(board.secondary.conquests.map((r) => r.name)).toEqual(["Bravo"]);
    expect(board.secondary.efficiency.map((r) => [r.name, r.value])).toEqual([["Charlie", 1_000]]);

    wait(3 * 60_000); // Monday 00:01: wiped.
    await service.tick();
    const alpha = a!.client.last("seasonEnded")!.result!;
    expect(alpha.league).toEqual({ before: 0, after: 1 });
    expect(alpha.rewards).toEqual(expect.arrayContaining([{ kind: "title", id: "champion" }, { kind: "color", id: "gold" }, { kind: "title", id: "silver" }]));
    expect(b!.client.last("seasonEnded")!.result!.rewards).toEqual(expect.arrayContaining([{ kind: "title", id: "conqueror" }]));
    expect(c!.client.last("seasonEnded")!.result!.rewards).toEqual(expect.arrayContaining([{ kind: "title", id: "frugal" }]));
    expect(d!.client.last("seasonEnded")!.result!.league).toEqual({ before: 0, after: 0 });

    // The rewards are on the account in the new season, and can be shown.
    const back = new Spy();
    const account = (await service.authenticate(a!.token))!;
    expect(account.league).toBe(1);
    await service.attach(account, back);
    const ready = back.last("ready")!;
    expect(ready.profile.league).toBe(1);
    expect(ready.profile.rewards).toEqual(expect.arrayContaining([{ kind: "title", id: "champion" }]));
    expect(ready.history[0]!.rewards).toEqual(expect.arrayContaining([{ kind: "color", id: "gold" }]));
    expect(ready.forest.league).toBe(1);
    await service.setCosmetic(a!.id, "title", "champion", back);
    await service.setCosmetic(a!.id, "color", "gold", back);
    expect(back.last("profile")!.profile).toMatchObject({ title: "champion", color: "gold" });
    expect(back.last("roster")!.roster.find((r) => r.id === a!.id)).toMatchObject({ title: "champion", rewardColor: "gold", league: 1 });
    // Only what the account won.
    await service.setCosmetic(a!.id, "skin", "amanita", back);
    expect(back.last("actionError")?.error).toBe("locked");
  });

  it("fills forests with room first, then opens one of the newcomer's league", async () => {
    const { service, store, play } = await setup(2);
    const low = await play("Low");
    const gold = await store.createAccount("Goldie", null);
    // The only forest with room is Bronze: it is filled first.
    await service.attach({ ...gold, league: 2 }, new Spy());
    expect(service.forestState(gold.id)).toBe(service.forestState(low.id));
    // Every forest is full: a new one opens, of the newcomer's league.
    const other = await store.createAccount("Goldie2", null);
    const spy = new Spy();
    await service.attach({ ...other, league: 2 }, spy);
    expect(service.forestState(other.id)).not.toBe(service.forestState(low.id));
    expect(spy.last("ready")!.forest.league).toBe(2);
  });

  it("unlocks Moisissure after three seasons and costs a league for two missed weeks", async () => {
    const { service, store, play, wait } = await setup(1);
    const a = await play("Alpha");
    // An hour past each wipe: the last Sunday of October changes the time in Paris.
    const past = 63 * 60_000;
    for (let s = 0; s < 3; s++) {
      wait(past);
      await service.tick();
      if (s < 2) {
        wait(WEEK - past);
        await service.attach((await store.findAccountByName("Alpha"))!, new Spy());
      }
    }
    const rewards = await store.rewardsOf(a.id);
    expect(rewards).toContainEqual({ kind: "strain", id: "mold" });
    expect(rewards).toContainEqual({ kind: "skin", id: "coprinus" });

    await store.setLeague(a.id, 3);
    wait(2 * WEEK); // Two weeks without playing.
    const back = new Spy();
    await service.attach((await store.findAccountByName("Alpha"))!, back);
    expect(back.last("ready")!.profile.league).toBe(2);
    expect(back.last("ready")!.game.unlockedStrains).toEqual(["mold"]);
  });
});
