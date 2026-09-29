import { describe, expect, it } from "vitest";
import { ECONOMY, OFFLINE, TERRAIN_STATS, type ServerMessage } from "@mycelium/shared";

const HOUR = 3_600_000;
import { GameService, hashToken, type GameClient } from "./game-service";
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

function setup() {
  let now = 1_700_000_000_000;
  const store = new MemoryStore();
  const service = new GameService(store, { now: () => now, log: () => {} });
  return {
    store,
    service,
    advanceTime: (ms: number) => (now += ms),
    now: () => now,
  };
}

async function join(service: GameService, name = "Spore") {
  const guest = await service.createGuest(name);
  if (!guest.ok) throw new Error(guest.error);
  const client = new Spy();
  const player = (await service.authenticate(guest.response.token))!;
  expect(await service.attach(player, client)).toBe(true);
  return { player, client, token: guest.response.token };
}

describe("guests", () => {
  it("creates a guest whose token authenticates", async () => {
    const { service, store } = setup();
    const res = await service.createGuest("  Kromiss ");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.response.player.name).toBe("Kromiss");
    expect(res.response.token.length).toBeGreaterThan(20);
    expect(await service.authenticate(res.response.token)).toEqual(res.response.player);
    expect(await service.authenticate("wrong")).toBeNull();
    // Only the hash is stored.
    expect(await store.findPlayerByToken(hashToken(res.response.token))).toEqual(res.response.player);
  });

  it("refuses invalid and taken names", async () => {
    const { service } = setup();
    expect(await service.createGuest("x")).toEqual({ ok: false, error: "invalid_name" });
    await service.createGuest("Hypha");
    expect(await service.createGuest("hypha")).toEqual({ ok: false, error: "name_taken" });
  });
});

describe("simulation", () => {
  it("sends the full game on attach", async () => {
    const { service } = setup();
    const { client } = await join(service);
    const ready = client.last("ready")!;
    expect(ready.player.name).toBe("Spore");
    expect(ready.game.nutrients).toBe(ECONOMY.startingNutrients);
    expect(ready.game.tiles.filter((t) => t.owned).map((t) => [t.q, t.r])).toEqual([[0, 0]]);
    expect(ready.away).toBeUndefined();
  });

  it("produces on every tick and pushes the state", async () => {
    const { service, advanceTime } = setup();
    const { client } = await join(service);
    advanceTime(5_000);
    service.tick();
    const state = client.last("state")!;
    expect(state.game.nutrients).toBeCloseTo(ECONOMY.startingNutrients + 5 * TERRAIN_STATS.humus.yieldPerSecond, 2);
    expect(state.game.biomass).toBeGreaterThan(0);
  });

  it("applies valid actions and reports invalid ones", async () => {
    const { service, advanceTime } = setup();
    const { player, client } = await join(service);
    service.colonize(player.id, 2, 0, client);
    expect(client.last("actionError")?.error).toBe("not_adjacent");

    advanceTime(60_000);
    service.colonize(player.id, 1, 0, client);
    const state = client.last("state")!;
    expect(state.game.tiles.filter((t) => t.owned)).toHaveLength(2);
    expect(state.game.tiles.find((t) => t.q === 1 && t.r === 0)?.growthEndsAt).toBeGreaterThan(0);

    // A second colonisation waits in the queue; it can be removed.
    service.colonize(player.id, -1, 0, client);
    expect(client.last("state")!.game.queue).toEqual([{ q: -1, r: 0 }]);
    service.unqueue(player.id, -1, 0, client);
    expect(client.last("state")!.game.queue).toEqual([]);
    service.moveHeart(player.id, 1, 0, client);
    expect(client.last("actionError")?.error).toBe("not_connected");

    service.buyUpgrade(player.id, "digestion", client);
    expect(client.last("state")!.game.upgrades.digestion).toBe(1);
    service.buyUpgrade(player.id, "teleport", client);
    expect(client.last("actionError")?.error).toBe("unknown_upgrade");
  });

  it("refuses actions from a client that is not attached", async () => {
    const { service } = setup();
    const { player } = await join(service);
    const stranger = new Spy();
    service.colonize(player.id, 1, 0, stranger);
    expect(stranger.last("actionError")?.error).toBe("not_authenticated");
  });

  it("saves on leave and finds exactly the same game when coming back", async () => {
    const { service, advanceTime } = setup();
    const { player, client } = await join(service);
    advanceTime(60_000);
    service.colonize(player.id, 1, 0, client);
    service.buyUpgrade(player.id, "biomassConversion", client);
    const before = client.last("state")!.game;

    await service.detach(player.id, client);
    expect(service.activeGame(player.id)).toBeUndefined();

    const again = new Spy();
    await service.attach(player, again);
    const after = again.last("ready")!.game;
    expect(after).toEqual(before);
  });

  it("shares one game between two tabs of the same player", async () => {
    const { service, advanceTime } = setup();
    const { player, client } = await join(service);
    const tab2 = new Spy();
    await service.attach(player, tab2);
    advanceTime(60_000);
    service.colonize(player.id, 0, 1, client);
    expect(tab2.last("state")!.game.tiles.filter((t) => t.owned)).toHaveLength(2);
    await service.detach(player.id, client);
    expect(service.activeGame(player.id)).toBeDefined();
  });

  it("saves every active game on stop", async () => {
    const { service, store, advanceTime } = setup();
    const { player } = await join(service);
    advanceTime(10_000);
    await service.stop();
    const saved = await store.loadGame(player.id);
    expect(saved?.nutrients).toBeCloseTo(ECONOMY.startingNutrients + 10 * TERRAIN_STATS.humus.yieldPerSecond, 2);
    expect(saved?.lastSeenAt).not.toBeNull();
  });

  it("catches up the absence with the offline rules and reports it", async () => {
    const { service, advanceTime } = setup();
    const { player, client } = await join(service);
    await service.detach(player.id, client);
    advanceTime(12 * HOUR);
    const back = new Spy();
    await service.attach(player, back);
    const { away, game } = back.last("ready")!;
    expect(game.lastSeenAt).toBeNull();
    expect(away?.awayMs).toBe(12 * HOUR);
    // One Humus tile: under 8 h at full rate + 4 h at 25 %, and well above 8 h at half rate.
    expect(away!.nutrients).toBeLessThan((8 + 4 * OFFLINE.reducedFactor) * 3600);
    expect(away!.nutrients).toBeGreaterThan(4 * 3600);
    expect(away!.biomass).toBeCloseTo(away!.nutrients * ECONOMY.biomassConversionRate, 6);
  });
});
