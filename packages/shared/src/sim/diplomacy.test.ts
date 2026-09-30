import { describe, expect, it } from "vitest";
import { advanceForest, joinForest, newForest, refreshReservations, type ForestState } from "../forest";
import { hex, hexesInRadius, hexKey } from "../hex";
import { resolvePacts, type PactEvent } from "../social";
import { botDiplomacy } from "./diplomacy";

const T0 = Date.UTC(2026, 9, 5);
const HOUR = 3_600_000;

/** Three robots in a row, each touching the next. */
function row(): ForestState {
  const f = newForest(5, T0 - 2 * 24 * HOUR, 4, { calendar: false });
  for (const t of f.tiles.values()) t.terrain = "humus";
  const ids = ["r1", "r2", "r3"];
  for (const id of ids) joinForest(f, id, T0 - 2 * 24 * HOUR);
  for (const t of f.tiles.values()) t.owner = null;
  ids.forEach((id, i) => {
    const p = f.players.get(id)!;
    p.heart = hex(-4 + 4 * i, 0);
    for (const h of hexesInRadius(p.heart, 2)) {
      const t = f.tiles.get(hexKey(h));
      if (t && t.owner === null) t.owner = id;
    }
    p.lastSeenAt = null;
    p.updatedAt = T0;
  });
  f.updatedAt = T0;
  refreshReservations(f, T0);
  return f;
}

describe("robot diplomacy (M7 test robots)", () => {
  it("forms pacts and breaks some during a week", () => {
    const f = row();
    const events: PactEvent[] = [];
    for (let t = T0; t < T0 + 7 * 24 * HOUR; t += 15 * 60_000) {
      advanceForest(f, t);
      events.push(...resolvePacts(f, t));
      for (const p of f.players.values()) events.push(...botDiplomacy(f, p, t));
    }
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has("invited")).toBe(true);
    expect(kinds.has("formed")).toBe(true);
    expect(kinds.has("betrayed") || kinds.has("left")).toBe(true);
    expect(f.pacts.length).toBeGreaterThanOrEqual(2);
  });
});
