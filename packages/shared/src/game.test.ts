import { describe, expect, it } from "vitest";
import {
  ECONOMY,
  EXHAUSTION,
  HEART_MOVE_COOLDOWN_MS,
  HUMIDITY,
  OFFLINE,
  QUEUE_MAX,
  TERRAIN_STATS,
  TRANSPORT,
  UPGRADE_IDS,
  type Terrain,
} from "./balance";
import {
  advance,
  buyUpgrade,
  checkColonize,
  cloneGame,
  colonizationCost,
  colonize,
  conversionRate,
  goOffline,
  goOnline,
  growthDurationMs,
  growthProgress,
  moveHeart,
  networkHops,
  newGame,
  productionRate,
  SOLO_PLAYER,
  tileProduction,
  tileYield,
  transportLoss,
  unqueue,
  upgradeCost,
  type GameState,
} from "./game";
import { hex, hexKey, type Hex } from "./hex";
import { fromSnapshot, toSnapshot } from "./protocol";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

/** A small game where every tile has the given terrain (the start tile stays Humus). */
/** Plenty of nutrients: tests about rules, not about waiting for income. */
const RICH = 10_000_000;

function game(terrain: Terrain = "humus", nutrients = RICH): GameState {
  const state = newGame(1, T0, 4);
  for (const t of state.tiles.values()) if (!(t.q === 0 && t.r === 0)) t.terrain = terrain;
  state.nutrients = nutrients;
  return state;
}

const tileAt = (s: GameState, h: Hex) => s.tiles.get(hexKey(h))!;

/** Makes tiles colonised instantly (no growth, no cost). */
function own(s: GameState, ...hexes: Hex[]): void {
  for (const h of hexes) tileAt(s, h).owner = SOLO_PLAYER;
}

describe("new game", () => {
  it("owns only the start tile and has the starting nutrients", () => {
    const s = newGame(5, T0);
    const owned = [...s.tiles.values()].filter((t) => t.owner === SOLO_PLAYER);
    expect(owned).toEqual([
      {
        q: 0,
        r: 0,
        terrain: "humus",
        owner: SOLO_PLAYER,
        growthEndsAt: null,
        growthStartedAt: null,
        exhaustion: 0,
        disconnectedSince: null,
        capture: null,
        reservedFor: null,
        structure: null,
        toxic: false,
      },
    ]);
    expect(s.nutrients).toBe(ECONOMY.startingNutrients);
    expect(s.enzymes).toBe(0);
    expect(s.enzymesUnlocked).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.lastSeenAt).toBeNull();
  });
});

describe("costs", () => {
  const LITTER = TERRAIN_STATS.litter.baseCost;
  const G = ECONOMY.sizeFactor;

  it("follows base × (1 + 0.05 × dist) × sizeFactor^tiles", () => {
    const s = game("litter");
    expect(colonizationCost(s, tileAt(s, hex(1, 0)))).toBeCloseTo(LITTER * 1.05 * G, 6);
    expect(colonizationCost(s, tileAt(s, hex(3, 0)))).toBeCloseTo(LITTER * 1.15 * G, 6);
  });

  it("measures the distance from the current Cœur", () => {
    const s = game("litter");
    own(s, hex(1, 0), hex(2, 0));
    s.heart = hex(2, 0);
    expect(colonizationCost(s, tileAt(s, hex(3, 0)))).toBeCloseTo(LITTER * 1.05 * G ** 3, 6);
  });

  it("is reduced by Expansion économe (−5 % per level, compounded)", () => {
    const s = game("humus");
    const base = colonizationCost(s, tileAt(s, hex(1, 0)));
    s.upgrades.thriftyExpansion = 2;
    expect(colonizationCost(s, tileAt(s, hex(1, 0)))).toBeCloseTo(base * 0.95 * 0.95, 10);
  });

  it("prices upgrades at base × 1.15^level", () => {
    for (const id of UPGRADE_IDS) expect(upgradeCost(id, 3) / upgradeCost(id, 0)).toBeCloseTo(1.15 ** 3, 10);
  });
});

describe("colonisation and queue", () => {
  it("only accepts wild land next to the network or to the planned path", () => {
    const s = game();
    tileAt(s, hex(-1, 0)).terrain = "wetland";
    expect(checkColonize(s, hex(2, 0))).toEqual({ ok: false, error: "not_adjacent" });
    expect(checkColonize(s, hex(0, 0))).toEqual({ ok: false, error: "already_owned" });
    expect(checkColonize(s, hex(40, 0))).toEqual({ ok: false, error: "unknown_tile" });
    expect(checkColonize(s, hex(-1, 0))).toEqual({ ok: false, error: "impassable" });
    expect(colonize(s, hex(1, 0), T0)).toEqual({ ok: true });
    // (2, 0) touches the growing tile: it can be planned now.
    expect(colonize(s, hex(2, 0), T0)).toEqual({ ok: true });
    expect(colonize(s, hex(3, 0), T0)).toEqual({ ok: true });
    expect(checkColonize(s, hex(3, 0))).toEqual({ ok: false, error: "already_queued" });
    expect(s.queue).toEqual([hex(2, 0), hex(3, 0)]);
  });

  it("pays, then grows for the terrain's growth time", () => {
    const s = game("deadwood");
    const cost = colonizationCost(s, tileAt(s, hex(0, 1)));
    colonize(s, hex(0, 1), T0);
    expect(s.nutrients).toBeCloseTo(RICH - cost, 6);
    expect(tileAt(s, hex(0, 1)).growthEndsAt).toBe(T0 + TERRAIN_STATS.deadwood.growthSeconds * 1000);
    expect(tileAt(s, hex(0, 1)).growthStartedAt).toBe(T0);
    expect(s.queue).toEqual([]);
  });

  it("keeps the growth progress when Croissance des hyphes is bought meanwhile", () => {
    const s = game("deadwood");
    colonize(s, hex(0, 1), T0);
    const t = tileAt(s, hex(0, 1));
    const half = T0 + (t.growthEndsAt! - T0) / 2;
    expect(growthProgress(t, half, s.upgrades)).toBeCloseTo(0.5, 10);
    advance(s, half);
    expect(buyUpgrade(s, "hyphalGrowth")).toEqual({ ok: true });
    expect(growthProgress(t, half, s.upgrades)).toBeCloseTo(0.5, 10);
    advance(s, t.growthEndsAt!);
    expect(t.growthEndsAt).toBeNull();
    expect(t.growthStartedAt).toBeNull();
    expect(growthProgress(t, half, s.upgrades)).toBe(1);
  });

  it("estimates the progress of a growth without recorded start without going backwards", () => {
    const s = game("deadwood");
    colonize(s, hex(0, 1), T0);
    const t = tileAt(s, hex(0, 1));
    t.growthStartedAt = null;
    s.upgrades.hyphalGrowth = 5;
    expect(growthProgress(t, T0, s.upgrades)).toBe(0);
    expect(growthProgress(t, t.growthEndsAt!, s.upgrades)).toBe(1);
  });

  it("records the start of growths launched from the queue", () => {
    const s = game("litter");
    colonize(s, hex(1, 0), T0);
    colonize(s, hex(2, 0), T0);
    const first = tileAt(s, hex(1, 0)).growthEndsAt!;
    advance(s, first);
    expect(tileAt(s, hex(2, 0)).growthStartedAt).toBe(first);
  });

  it("starts queued tiles one after the other", () => {
    const s = game("litter");
    colonize(s, hex(1, 0), T0);
    colonize(s, hex(2, 0), T0);
    colonize(s, hex(-1, 0), T0);
    const d = growthDurationMs("litter", s.upgrades);
    advance(s, T0 + d);
    expect(tileAt(s, hex(1, 0)).growthEndsAt).toBeNull();
    expect(tileAt(s, hex(2, 0)).growthEndsAt).toBe(T0 + 2 * d);
    advance(s, T0 + 3 * d);
    expect([hex(1, 0), hex(2, 0), hex(-1, 0)].every((h) => tileAt(s, h).owner === SOLO_PLAYER)).toBe(true);
    expect(s.queue).toEqual([]);
  });

  it("waits for nutrients, retrying on the 5 s grid", () => {
    const s = game("humus", 0);
    const missing = 30; // About 30 s of production of the start tile.
    s.nutrients = colonizationCost(s, tileAt(s, hex(1, 0))) - missing;
    colonize(s, hex(1, 0), T0);
    expect(tileAt(s, hex(1, 0)).owner).toBeNull();
    advance(s, T0 + 60_000);
    const t = tileAt(s, hex(1, 0));
    expect(t.owner).toBe(SOLO_PLAYER);
    // Affordable after ~30 s at 1/s, started at the next multiple of 5 s.
    const started = t.growthEndsAt! - growthDurationMs("humus", s.upgrades);
    expect(started % 5_000).toBe(0);
    expect(started - T0).toBeGreaterThanOrEqual(missing * 1000);
    expect(started - T0).toBeLessThan(missing * 1000 + 5_000 + 100);
  });

  it("caps the queue and drops tiles that become unreachable", () => {
    const s = game();
    colonize(s, hex(1, 0), T0);
    for (let q = 2; q <= 4; q++) colonize(s, hex(q, 0), T0);
    for (let r = 1; r <= 4; r++) colonize(s, hex(0, r), T0);
    for (let r = -1; r >= -4; r--) colonize(s, hex(0, r), T0);
    expect(s.queue).toHaveLength(QUEUE_MAX);
    expect(checkColonize(s, hex(-1, 0))).toEqual({ ok: false, error: "queue_full" });

    expect(unqueue(s, hex(2, 0))).toEqual({ ok: true });
    expect(unqueue(s, hex(2, 0))).toEqual({ ok: false, error: "not_queued" });
    advance(s, T0 + HOUR);
    // (3, 0) and (4, 0) were planned behind (2, 0): dropped when their turn came.
    expect(tileAt(s, hex(3, 0)).owner).toBeNull();
    expect(tileAt(s, hex(0, 4)).owner).toBe(SOLO_PLAYER);
    expect(s.queue).toEqual([]);
  });

  it("grows faster with Croissance des hyphes (−8 % per level, compounded)", () => {
    const s = game();
    s.upgrades.hyphalGrowth = 3;
    expect(growthDurationMs("humus", s.upgrades)).toBe(Math.round(60_000 * 0.92 ** 3));
  });
});

describe("network and transport", () => {
  it("counts hops from the Cœur through colonised tiles", () => {
    const s = game();
    own(s, hex(1, 0), hex(2, 0), hex(2, 1));
    const hops = networkHops(s);
    expect(hops.get("0,0")).toBe(0);
    expect(hops.get("2,0")).toBe(2);
    expect(hops.get("2,1")).toBe(3); // Reached through (2, 0).
  });

  it("loses 1 % per hop on the way to the Cœur", () => {
    const s = game("humus");
    own(s, hex(1, 0), hex(2, 0), hex(3, 0));
    expect(transportLoss(3)).toBeCloseTo(0.03, 10);
    expect(transportLoss(500)).toBe(TRANSPORT.maxLoss);
    expect(tileProduction(s, tileAt(s, hex(3, 0)))).toBeCloseTo(1 * 0.97, 10);
    expect(productionRate(s)).toBeCloseTo(1 + 0.99 + 0.98 + 0.97, 10);
  });

  it("stops producing on disconnected tiles, then loses them", () => {
    const s = game("humus");
    own(s, hex(1, 0), hex(2, 0), hex(3, 0));
    // Cut the link at (1, 0) by hand (no player can do it before M3).
    tileAt(s, hex(1, 0)).owner = null;
    advance(s, T0 + 1_000);
    expect(tileProduction(s, tileAt(s, hex(3, 0)))).toBe(0);
    expect(tileAt(s, hex(3, 0)).disconnectedSince).toBe(T0);
    advance(s, T0 + TRANSPORT.witherMs);
    expect(tileAt(s, hex(2, 0)).owner).toBeNull();
    expect(tileAt(s, hex(3, 0)).owner).toBeNull();
  });

  it("moves the Cœur once per day, onto the connected network", () => {
    const s = game("humus");
    own(s, hex(1, 0), hex(2, 0), hex(4, 0));
    expect(moveHeart(s, hex(4, 0), T0)).toEqual({ ok: false, error: "not_connected" });
    expect(moveHeart(s, hex(3, 0), T0)).toEqual({ ok: false, error: "not_connected" });
    expect(moveHeart(s, hex(2, 0), T0)).toEqual({ ok: true });
    expect(networkHops(s).get("0,0")).toBe(2);
    expect(moveHeart(s, hex(1, 0), T0 + HOUR)).toEqual({ ok: false, error: "heart_cooldown" });
    expect(moveHeart(s, hex(1, 0), T0 + HEART_MOVE_COOLDOWN_MS)).toEqual({ ok: true });
  });
});

describe("production", () => {
  it("ignores tiles that are still growing", () => {
    const s = game();
    colonize(s, hex(1, 0), T0);
    expect(productionRate(s)).toBe(TERRAIN_STATS.humus.yieldPerSecond);
  });

  it("applies Digestion accrue and Décomposeur de bois", () => {
    const up = { ...newGame(1, T0).upgrades, digestion: 2, woodDecomposer: 4 };
    expect(tileYield("humus", up)).toBeCloseTo(1 * 1.2, 10);
    expect(tileYield("deadwood", up)).toBeCloseTo(3 * 1.2 * 1.6, 10);
  });

  it("boosts tiles next to a wetland", () => {
    const s = game("humus");
    own(s, hex(1, 0));
    tileAt(s, hex(2, 0)).terrain = "wetland";
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo((1 + HUMIDITY.wetlandBonus) * 0.99, 10);
  });

  it("converts a share of the production into biomass", () => {
    const s = game();
    s.nutrients = 0;
    advance(s, T0 + 10_000);
    const e = (EXHAUSTION.max * 10_000) / TERRAIN_STATS.humus.lifetimeMs;
    expect(s.nutrients).toBeCloseTo(10 * (1 - e / 2), 8);
    expect(s.biomass).toBeCloseTo(s.nutrients * ECONOMY.biomassConversionRate, 10);
    s.upgrades.biomassConversion = 5;
    expect(conversionRate(s.upgrades)).toBeCloseTo(ECONOMY.biomassConversionRate * 1.5, 10);
  });

  it("gives the same result with one big step or many ticks", () => {
    const a = game("deadwood", 20);
    colonize(a, hex(1, 0), T0);
    colonize(a, hex(2, 0), T0);
    colonize(a, hex(0, 1), T0);
    const b = cloneGame(a);
    const c = cloneGame(a);
    advance(a, T0 + 6 * HOUR);
    for (let t = T0; t <= T0 + 6 * HOUR; t += 5_000) advance(b, t);
    for (let t = T0, i = 0; t < T0 + 6 * HOUR; i++) {
      t = Math.min(T0 + 6 * HOUR, t + 1 + ((i * 7919) % 97_000));
      advance(c, t);
    }
    for (const x of [b, c]) {
      // Event times are rounded to the ms, so allow float-level differences only.
      expect(Math.abs(x.nutrients - a.nutrients) / a.nutrients).toBeLessThan(1e-7);
      expect(Math.abs(x.biomass - a.biomass) / a.biomass).toBeLessThan(1e-7);
      expect(toSnapshot(x).tiles.map((t) => [t.q, t.r, t.owner, t.growthEndsAt])).toEqual(
        toSnapshot(a).tiles.map((t) => [t.q, t.r, t.owner, t.growthEndsAt]),
      );
    }
  });

  it("never goes back in time", () => {
    const s = game();
    advance(s, T0 + 5_000);
    const n = s.nutrients;
    advance(s, T0);
    expect(s.nutrients).toBe(n);
    expect(s.updatedAt).toBe(T0 + 5_000);
  });
});

describe("exhaustion", () => {
  it("wears a producing tile down to its cap over its lifetime, then stops", () => {
    const s = game("litter");
    own(s, hex(1, 0));
    const L = TERRAIN_STATS.litter.lifetimeMs;
    advance(s, T0 + L / 2);
    expect(tileAt(s, hex(1, 0)).exhaustion).toBeCloseTo(EXHAUSTION.max / 2, 10);
    advance(s, T0 + L);
    expect(tileAt(s, hex(1, 0)).exhaustion).toBeCloseTo(EXHAUSTION.max, 10);
    advance(s, T0 + 10 * L);
    expect(tileAt(s, hex(1, 0)).exhaustion).toBe(EXHAUSTION.max);
    // A worn tile keeps 60 % of its yield.
    expect(tileProduction(s, tileAt(s, hex(1, 0)))).toBeCloseTo(0.5 * (1 - EXHAUSTION.max) * 0.99, 10);
  });

  it("integrates the decline exactly", () => {
    const s = game("litter");
    s.nutrients = 0;
    tileAt(s, hex(0, 0)).terrain = "litter";
    const L = TERRAIN_STATS.litter.lifetimeMs;
    const m = EXHAUSTION.max;
    advance(s, T0 + 2 * L);
    // ∫0^L (1 − mτ/L) dτ + L × (1 − m) = L(1 − m/2) + L(1 − m)
    expect(s.nutrients).toBeCloseTo((0.5 * L * (1 - m / 2 + 1 - m)) / 1000, 6);
  });

  it("turns worn-out Dead wood into fresh Humus", () => {
    const s = game("deadwood");
    own(s, hex(1, 0));
    advance(s, T0 + TERRAIN_STATS.deadwood.lifetimeMs + 1);
    const t = tileAt(s, hex(1, 0));
    expect(t.terrain).toBe("humus");
    expect(t.exhaustion).toBeLessThan(0.001);
  });

  it("never regenerates", () => {
    const s = game("litter");
    const wild = tileAt(s, hex(2, 2));
    wild.exhaustion = 0.3;
    own(s, hex(1, 0));
    tileAt(s, hex(1, 0)).exhaustion = 0.2;
    tileAt(s, hex(1, 0)).owner = null; // Lost: wear stays on the tile.
    advance(s, T0 + 48 * HOUR);
    expect(wild.exhaustion).toBe(0.3);
    expect(tileAt(s, hex(1, 0)).exhaustion).toBe(0.2);
  });
});

describe("offline", () => {
  it("produces fully for 8 h, then at 25 %", () => {
    const s = game("humus");
    s.nutrients = 0;
    goOffline(s, T0);
    // Keep exhaustion out of the way to check the factor alone.
    const check = cloneGame(s);
    advance(check, T0 + OFFLINE.fullMs - 1);
    expect(productionRate(check, check.updatedAt)).toBeGreaterThan(0);
    const before = productionRate(check, T0 + OFFLINE.fullMs - 1);
    const after = productionRate(check, T0 + OFFLINE.fullMs);
    expect(after / before).toBeCloseTo(OFFLINE.reducedFactor, 10);
  });

  it("runs the queue while the player is away and comes back online", () => {
    const s = game("litter", 20_000);
    colonize(s, hex(1, 0), T0);
    colonize(s, hex(2, 0), T0);
    goOffline(s, T0);
    goOnline(s, T0 + 12 * HOUR);
    expect(s.lastSeenAt).toBeNull();
    expect(tileAt(s, hex(2, 0)).owner).toBe(SOLO_PLAYER);
    expect(s.queue).toEqual([]);
  });
});

describe("upgrades", () => {
  it("pays and levels up", () => {
    const cost = upgradeCost("digestion", 0);
    const s = game("humus", cost + 100);
    expect(buyUpgrade(s, "digestion")).toEqual({ ok: true });
    expect(s.upgrades.digestion).toBe(1);
    expect(s.nutrients).toBeCloseTo(100, 6);
  });

  it("refuses unknown upgrades and empty wallets", () => {
    const s = game("humus", 0);
    expect(buyUpgrade(s, "nope")).toEqual({ ok: false, error: "unknown_upgrade" });
    expect(buyUpgrade(s, "digestion")).toEqual({ ok: false, error: "not_enough_nutrients" });
  });
});

describe("snapshot", () => {
  it("round-trips the whole game", () => {
    const s = newGame(31337, T0);
    s.nutrients = RICH;
    colonize(s, hex(0, 1), T0 + 1);
    colonize(s, hex(0, 2), T0 + 1);
    advance(s, T0 + HOUR);
    goOffline(s, T0 + HOUR);
    s.upgrades.woodDecomposer = 2;
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))), s.seed);
    expect(back).toEqual(s);
  });
});
