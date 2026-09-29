import { describe, expect, it } from "vitest";
import { hex, hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors } from "./hex";
import { parseClientMessage } from "./protocol";

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
});

describe("protocol", () => {
  it("accepts ping and rejects garbage", () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(parseClientMessage('{"type":"nope"}')).toBeNull();
    expect(parseClientMessage("not json")).toBeNull();
  });
});
