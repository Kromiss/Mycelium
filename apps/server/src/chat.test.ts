import { describe, expect, it } from "vitest";
import { CHAT, type ServerMessage } from "@mycelium/shared";
import { ForestService, type GameClient } from "./forest-service";
import type { PushSender } from "./push";
import { MemoryStore, type PushSubscriptionRecord } from "./store";

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
  texts(): string[] {
    return this.all("chat").map((m) => m.message.text);
  }
}

class PushSpy implements PushSender {
  readonly publicKey = "public-key";
  readonly sent: Array<{ endpoint: string; body: string; tag: string }> = [];
  gone = new Set<string>();
  async send(sub: PushSubscriptionRecord, payload: { title: string; body: string; tag: string }) {
    if (this.gone.has(sub.endpoint)) return "gone" as const;
    this.sent.push({ endpoint: sub.endpoint, body: payload.body, tag: payload.tag });
    return "ok" as const;
  }
}

/** Thursday 8 October 2026, 10:00 Paris. */
const THURSDAY = Date.UTC(2026, 9, 8, 8);
/** Sunday 11 October 2026, 23:30 Paris: half an hour before the freeze. */
const SUNDAY_LATE = Date.UTC(2026, 9, 11, 21, 30);

async function setup(at = THURSDAY) {
  let real = at;
  const store = new MemoryStore();
  const push = new PushSpy();
  const service = new ForestService(store, { now: () => real, capacity: 4, push, admins: ["Warden"], log: () => {} });
  await service.start({ tick: false });
  const play = async (name: string) => {
    const res = await service.register(name, "correct horse");
    if (!res.ok) throw new Error(res.error);
    const account = (await service.authenticate(res.session.token))!;
    const client = new Spy();
    expect(await service.attach(account, client)).toBe(true);
    return { id: account.id, account, client };
  };
  return { store, service, push, play, wait: (ms: number) => (real += ms) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("forest chat", () => {
  it("reaches everybody in the forest and comes back with the history", async () => {
    const { service, play } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    await service.chat(a.id, "forest", "  hello\nforest ", undefined, a.client);
    expect(a.client.texts()).toEqual(["hello forest"]);
    expect(b.client.last("chat")?.message).toMatchObject({ channel: "forest", from: a.id, fromName: "Amanita", text: "hello forest" });

    const again = new Spy();
    await service.attach(b.account, again);
    expect(again.last("ready")?.chat.map((m) => m.text)).toEqual(["hello forest"]);
  });

  it("lists every colony of the forest and tells the others when someone joins", async () => {
    const { play } = await setup();
    const a = await play("Amanita");
    expect(a.client.last("ready")?.roster.map((r) => r.name)).toEqual(["Amanita"]);
    await play("Boletus");
    expect(a.client.last("roster")?.roster.map((r) => r.name).sort()).toEqual(["Amanita", "Boletus"]);
  });

  it("keeps private messages between the two players", async () => {
    const { service, play } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    const c = await play("Cortinarius");
    await service.chat(a.id, "dm", "psst", b.id, a.client);
    expect(a.client.texts()).toEqual(["psst"]);
    expect(b.client.last("chat")?.message).toMatchObject({ channel: "dm", to: b.id, text: "psst" });
    expect(c.client.texts()).toEqual([]);
    const later = new Spy();
    await service.attach(c.account, later);
    expect(later.last("ready")?.chat).toEqual([]);

    await service.chat(a.id, "dm", "me", a.id, a.client);
    expect(a.client.last("chatError")?.error).toBe("self");
    await service.chat(a.id, "dm", "who", "not-a-player", a.client);
    expect(a.client.last("chatError")?.error).toBe("unknown_player");
    await service.chat(a.id, "pact", "allies?", undefined, a.client);
    expect(a.client.last("chatError")?.error).toBe("no_pact");
  });

  it("stops spam and repeated messages", async () => {
    const { service, play, wait } = await setup();
    const a = await play("Amanita");
    await service.chat(a.id, "forest", "same", undefined, a.client);
    await service.chat(a.id, "forest", "SAME", undefined, a.client);
    expect(a.client.last("chatError")?.error).toBe("repeated");
    for (let i = 0; i < CHAT.burst; i++) await service.chat(a.id, "forest", `m${i}`, undefined, a.client);
    expect(a.client.last("chatError")?.error).toBe("rate_limited");
    wait(CHAT.windowMs);
    await service.chat(a.id, "forest", "ok again", undefined, a.client);
    expect(a.client.texts().at(-1)).toBe("ok again");
    await service.chat(a.id, "forest", "x".repeat(CHAT.maxLength + 1), undefined, a.client);
    expect(a.client.last("chatError")?.error).toBe("too_long");
  });

  it("hides the messages of a muted player, live and in the history", async () => {
    const { service, play } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    await service.chat(a.id, "forest", "before", undefined, a.client);
    await service.mute(b.id, a.id, true);
    await service.chat(a.id, "forest", "after", undefined, a.client);
    expect(b.client.texts()).toEqual(["before"]);
    const again = new Spy();
    await service.attach(b.account, again);
    expect(again.last("ready")?.chat).toEqual([]);
    expect(again.last("ready")?.muted).toEqual([a.id]);
    await service.mute(b.id, a.id, false);
    await service.chat(a.id, "forest", "back", undefined, a.client);
    expect(again.texts()).toEqual(["back"]);
  });

  it("keeps reports and lets admins cut a player's chat for a day", async () => {
    const { service, store, play, wait } = await setup();
    const warden = await play("Warden");
    const troll = await play("Troll");
    expect(warden.client.last("ready")?.admin).toBe(true);
    expect(troll.client.last("ready")?.admin).toBe(false);
    await service.chat(troll.id, "forest", "rude words", undefined, troll.client);
    const id = warden.client.last("chat")!.message.id;
    await service.report(warden.id, id, warden.client);
    expect(warden.client.last("chatNotice")?.notice).toBe("reported");
    expect(store.reportCount()).toBe(1);

    // Only admins can silence.
    await service.silence(troll.id, warden.id, troll.client);
    expect(troll.client.last("chatNotice")).toBeUndefined();
    await service.silence(warden.id, troll.id, warden.client);
    expect(warden.client.last("chatNotice")).toMatchObject({ notice: "silenced", name: "Troll" });
    await service.chat(troll.id, "forest", "more", undefined, troll.client);
    expect(troll.client.last("chatError")?.error).toBe("silenced");
    wait(CHAT.silenceMs + 1);
    await service.chat(troll.id, "forest", "sorry", undefined, troll.client);
    expect(warden.client.texts().at(-1)).toBe("sorry");
  });
});

describe("browser notifications", () => {
  it("tells an absent player about a private message, at most once every 30 min", async () => {
    const { service, push, play, wait } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    await service.subscribePush(b.id, { endpoint: "https://push.example/b", p256dh: "k", auth: "a", lang: "fr", kinds: ["dm"] });
    // Connected: the chat is enough.
    await service.chat(a.id, "dm", "hello", b.id, a.client);
    await flush();
    expect(push.sent).toEqual([]);

    await service.detach(b.id, b.client);
    await service.chat(a.id, "dm", "are you there?", b.id, a.client);
    await flush();
    expect(push.sent).toEqual([{ endpoint: "https://push.example/b", body: "Amanita : are you there?", tag: "dm" }]);
    wait(20_000);
    await service.chat(a.id, "dm", "hello??", b.id, a.client);
    await flush();
    expect(push.sent).toHaveLength(1);
  });

  it("only sends the kinds the player asked for, and forgets dead subscriptions", async () => {
    const { service, store, push, play } = await setup();
    const a = await play("Amanita");
    const b = await play("Boletus");
    await service.subscribePush(b.id, { endpoint: "https://push.example/b", p256dh: "k", auth: "a", lang: "en", kinds: ["boss"] });
    await service.detach(b.id, b.client);
    await service.chat(a.id, "dm", "hi", b.id, a.client);
    await flush();
    expect(push.sent).toEqual([]);

    await service.subscribePush(b.id, { endpoint: "https://push.example/b", p256dh: "k", auth: "a", lang: "en", kinds: ["dm"] });
    push.gone.add("https://push.example/b");
    await service.chat(a.id, "dm", "hi again", b.id, a.client);
    await flush();
    await flush();
    expect(await store.pushSubscriptions(b.id)).toEqual([]);
  });

  it("warns absent players an hour before the end of the season", async () => {
    const { service, push, play, wait } = await setup(SUNDAY_LATE);
    const a = await play("Amanita");
    await service.subscribePush(a.id, { endpoint: "https://push.example/a", p256dh: "k", auth: "a", lang: "en", kinds: ["seasonEnd"] });
    await service.detach(a.id, a.client);
    wait(5000);
    await service.tick();
    await flush();
    expect(push.sent.map((s) => s.tag)).toEqual(["seasonEnd"]);
    wait(5000);
    await service.tick();
    await flush();
    expect(push.sent).toHaveLength(1);
  });
});
