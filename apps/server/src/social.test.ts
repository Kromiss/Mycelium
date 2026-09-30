import { describe, expect, it } from "vitest";
import { PACTS, type ServerMessage } from "@mycelium/shared";
import { ForestService, type GameClient } from "./forest-service";
import { MemoryStore } from "./store";

class Spy implements GameClient {
  readonly messages: ServerMessage[] = [];
  send(msg: ServerMessage): void {
    this.messages.push(msg);
  }
  all<T extends ServerMessage["type"]>(type: T): Array<Extract<ServerMessage, { type: T }>> {
    return this.messages.filter((m) => m.type === type) as Array<Extract<ServerMessage, { type: T }>>;
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.all(type).at(-1);
  }
  alerts() {
    return this.all("state").flatMap((m) => m.alerts);
  }
}

/** Thursday 8 October 2026, 10:00 Paris. */
const THURSDAY = Date.UTC(2026, 9, 8, 8);

async function setup() {
  let real = THURSDAY;
  const service = new ForestService(new MemoryStore(), { now: () => real, capacity: 4, log: () => {} });
  await service.start({ tick: false });
  const play = async (name: string) => {
    const res = await service.register(name, "correct horse");
    if (!res.ok) throw new Error(res.error);
    const account = (await service.authenticate(res.session.token))!;
    const client = new Spy();
    expect(await service.attach(account, client)).toBe(true);
    return { id: account.id, account, client };
  };
  return { service, play, wait: (ms: number) => (real += ms) };
}

describe("pacts through the server (M7)", () => {
  it("invite, accept, chat in the pact, and see the alliance ranked", async () => {
    const { service, play, wait } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    const c = await play("Cortinarius");
    service.pactInvite(a.id, b.id, a.client);
    expect(a.client.last("state")?.social.invitesOut).toEqual([{ to: b.id, at: expect.any(Number) }]);
    wait(5000);
    await service.tick();
    expect(b.client.alerts()).toContainEqual({ type: "pact", event: "invited", by: a.id });
    expect(b.client.last("state")?.social.invitesIn.map((i) => i.from)).toEqual([a.id]);

    service.pactAnswer(b.id, a.id, true, b.client);
    const pact = b.client.last("state")!.social.pact!;
    expect(pact.members.sort()).toEqual([a.id, b.id].sort());
    expect(b.client.last("state")!.game.pact).toBe(pact.id);
    wait(5000);
    await service.tick();
    expect(a.client.alerts()).toContainEqual({ type: "pact", event: "formed", by: b.id });
    expect(a.client.last("state")!.owners.find((o) => o.id === b.id)?.ally).toBe(true);

    await service.chat(a.id, "pact", "between us", undefined, a.client);
    expect(b.client.last("chat")?.message).toMatchObject({ channel: "pact", text: "between us" });
    expect(c.client.all("chat")).toEqual([]);

    wait(60 * 60_000);
    await service.tick();
    const board = a.client.last("leaderboard")!.leaderboard;
    expect(board.alliances).toHaveLength(1);
    expect(board.alliances[0]).toMatchObject({ rank: 1, active: true });
    expect(board.alliances[0]!.members.sort()).toEqual(["Amanita", "Boletus"]);
    expect(board.alliances[0]!.score).toBeGreaterThan(0);
  });

  it("marks a traitor for everybody and tells the betrayed ally", async () => {
    const { service, play, wait } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    const c = await play("Cortinarius");
    service.pactInvite(a.id, b.id, a.client);
    service.pactAnswer(b.id, a.id, true, b.client);
    service.pactBetray(a.id, a.client);
    expect(a.client.last("state")!.game.taintedUntil).toBeGreaterThan(0);
    expect(a.client.last("state")!.social.pact).toBeNull();
    wait(5000);
    await service.tick();
    expect(b.client.alerts()).toContainEqual({ type: "pact", event: "betrayed", by: a.id });
    service.pactInvite(a.id, c.id, a.client);
    expect(a.client.last("actionError")?.error).toBe("tainted");
    // Everybody sees the stain on the traitor's network once it is in view.
    const view = (await service.forestState(c.id))!;
    expect(view.players.get(a.id)!.taintedUntil).toBe(THURSDAY + PACTS.taintMs);
  });

  it("tells an absent member in the night journal", async () => {
    const { service, play, wait } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    service.pactInvite(a.id, b.id, a.client);
    service.pactAnswer(b.id, a.id, true, b.client);
    await service.detach(b.id, b.client);
    service.pactLeave(a.id, a.client);
    wait(PACTS.leaveNoticeMs + 5000);
    await service.tick();
    const back = new Spy();
    await service.attach(b.account, back);
    const journal = back.last("ready")!.away!.journal;
    expect(journal).toContainEqual({ type: "pact", event: "ended", name: "Amanita" });
  });
});
