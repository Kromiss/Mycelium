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

  it("validates player names", () => {
    expect(isValidPlayerName("Kromiss")).toBe(true);
    expect(isValidPlayerName("Élodie_42")).toBe(true);
    expect(isValidPlayerName("ab")).toBe(false);
    expect(isValidPlayerName("a".repeat(21))).toBe(false);
    expect(isValidPlayerName("no spaces")).toBe(false);
    expect(isValidPlayerName("<script>")).toBe(false);
  });
});
