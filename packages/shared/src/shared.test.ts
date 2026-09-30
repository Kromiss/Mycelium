import { describe, expect, it } from "vitest";
import { hex, hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors, hexToPixel, pixelToHex } from "./hex";
import { isValidPlayerName, parseClientMessage } from "./protocol";

describe("hex grid", () => {
  it("measures distance in steps", () => {
    expect(hexDistance(hex(0, 0), hex(0, 0))).toBe(0);
    expect(hexDistance(hex(0, 0), hex(2, -1))).toBe(2);
    expect(hexDistance(hex(-3, 1), hex(2, 0))).toBe(5);
  });

  it("has six neighbors, all at distance 1", () => {
    const n = hexNeighbors(hex(4, -2));
    expect(n).toHaveLength(6);
    for (const h of n) expect(hexDistance(h, hex(4, -2))).toBe(1);
    expect(new Set(n.map(hexKey)).size).toBe(6);
  });

  it("counts hexes in a radius as 3r(r+1)+1", () => {
    for (const r of [0, 1, 2, 5]) {
      const cells = hexesInRadius(hex(1, 1), r);
      expect(cells).toHaveLength(3 * r * (r + 1) + 1);
      expect(cells.every((c) => hexDistance(c, hex(1, 1)) <= r)).toBe(true);
    }
  });

  it("compares by value", () => {
    expect(hexEquals(hex(1, 2), hex(1, 2))).toBe(true);
    expect(hexEquals(hex(1, 2), hex(2, 1))).toBe(false);
  });

  it("converts between hexes and pixels", () => {
    for (const h of hexesInRadius(hex(0, 0), 4)) {
      const { x, y } = hexToPixel(h, 20);
      expect(pixelToHex(x, y, 20)).toEqual(h);
      // Points well inside the hex still map to it.
      expect(pixelToHex(x + 8, y - 5, 20)).toEqual(h);
    }
    expect(hexToPixel(hex(0, 0))).toEqual({ x: 0, y: 0 });
  });
});

describe("protocol", () => {
  it("accepts ping and rejects garbage", () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage("not json")).toBeNull();
  });

  it("validates game messages", () => {
    expect(parseClientMessage('{"type":"auth","token":"abc"}')).toEqual({ type: "auth", token: "abc" });
    expect(parseClientMessage('{"type":"auth","token":""}')).toBeNull();
    expect(parseClientMessage('{"type":"colonize","q":1,"r":-2}')).toEqual({ type: "colonize", q: 1, r: -2 });
    expect(parseClientMessage('{"type":"colonize","q":1.5,"r":0}')).toBeNull();
    expect(parseClientMessage('{"type":"colonize","q":"1","r":0}')).toBeNull();
    expect(parseClientMessage('{"type":"buyUpgrade","upgrade":"digestion"}')).toEqual({
      type: "buyUpgrade",
      upgrade: "digestion",
    });
    expect(parseClientMessage("null")).toBeNull();
  });

  it("validates chat and notification messages", () => {
    const p = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(p({ type: "chat", channel: "forest", text: "hi" })).toEqual({ type: "chat", channel: "forest", text: "hi" });
    expect(p({ type: "chat", channel: "dm", to: "abc", text: "hi" })).toEqual({ type: "chat", channel: "dm", to: "abc", text: "hi" });
    expect(p({ type: "chat", channel: "dm", text: "hi" })).toBeNull();
    expect(p({ type: "chat", channel: "shout", text: "hi" })).toBeNull();
    expect(p({ type: "chat", channel: "forest", text: "x".repeat(5000) })).toBeNull();
    expect(p({ type: "mute", player: "a", muted: true })).toEqual({ type: "mute", player: "a", muted: true });
    expect(p({ type: "report", message: 0 })).toBeNull();
    expect(p({ type: "report", message: 12 })).toEqual({ type: "report", message: 12 });
    const sub = { type: "pushSubscribe", endpoint: "https://push.example/x", p256dh: "k", auth: "a", lang: "fr", kinds: ["dm", "nope", "dm"] };
    expect(p(sub)).toEqual({ ...sub, kinds: ["dm"] });
    expect(p({ ...sub, endpoint: "http://insecure/x" })).toBeNull();
    expect(p({ ...sub, lang: "de" })).toBeNull();
  });

  it("validates pact, Signal and relic messages", () => {
    const p = (o: unknown) => parseClientMessage(JSON.stringify(o));
    expect(p({ type: "pactInvite", to: "b" })).toEqual({ type: "pactInvite", to: "b" });
    expect(p({ type: "pactAnswer", from: "b", accept: "yes" })).toBeNull();
    expect(p({ type: "pactBetray", extra: 1 })).toEqual({ type: "pactBetray" });
    expect(p({ type: "send", to: "b", resource: "nutrients", amount: 12.5 })).toEqual({ type: "send", to: "b", resource: "nutrients", amount: 12.5 });
    expect(p({ type: "send", to: "b", resource: "spores", amount: 1 })).toBeNull();
    expect(p({ type: "send", to: "b", resource: "enzymes", amount: -1 })).toBeNull();
    expect(p({ type: "listen", target: "b" })).toEqual({ type: "listen", target: "b" });
    expect(p({ type: "chooseRelic", relic: "vigour" })).toEqual({ type: "chooseRelic", relic: "vigour" });
  });

  it("validates player names", () => {
    expect(isValidPlayerName("Kromiss")).toBe(true);
    expect(isValidPlayerName("Élodie_42")).toBe(true);
    expect(isValidPlayerName("ab")).toBe(false);
    expect(isValidPlayerName("a".repeat(21))).toBe(false);
    expect(isValidPlayerName("no spaces")).toBe(false);
    expect(isValidPlayerName("<script>")).toBe(false);
  });
});
