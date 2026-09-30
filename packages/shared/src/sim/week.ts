/**
 * Solo week simulation (roadmap M2): a simple bot plays a week with a given schedule, using the
 * real rules. Used by the CI test `sim.test.ts` and by `pnpm --filter @mycelium/shared simulate`.
 */
import { QUEUE_MAX, TERRAIN_STATS, UPGRADE_STATS, type UpgradeId } from "../balance";
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
  heartReadyAt,
  humidity,
  moveHeart,
  networkHops,
  newGame,
  productionRate,
  richness,
  tileYield,
  upgradeCost,
  type GameState,
  type Tile,
} from "../game";
import { hexKey, hexNeighbors } from "../hex";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A daily schedule: sessions as [start hour, length in minutes]. */
export interface Profile {
  name: string;
  sessions: ReadonlyArray<readonly [startHour: number, minutes: number]>;
}

export const PROFILES = {
  /** GDD §9: "3 sessions de 10 min/jour". */
  casual: { name: "3 × 10 min/day", sessions: [[8, 10], [13, 10], [20, 10]] },
  /** Roadmap M2: "12 h/jour". */
  hardcore: { name: "12 h/day", sessions: [[8, 12 * 60]] },
} satisfies Record<string, Profile>;

export interface DayReport {
  day: number;
  /** Nutrients per second at the end of the day, as if the player were online. */
  rate: number;
  biomass: number;
  nutrients: number;
  tiles: number;
  upgrades: Record<UpgradeId, number>;
}

export interface SimulationOptions {
  seed?: number;
  days?: number;
  /** Seconds between two bot decisions during a session. */
  decisionEverySeconds?: number;
}

/** Plays `days` days (Monday 00:00 = day start) and reports the state at the end of each day. */
export function simulateWeek(profile: Profile, options: SimulationOptions = {}): DayReport[] {
  const { seed = 20260928, days = 7, decisionEverySeconds = 30 } = options;
  const t0 = Date.UTC(2026, 8, 28); // Any Monday: only durations matter.
  const firstSession = t0 + profile.sessions[0]![0] * HOUR;
  const state = newGame(seed, firstSession);
  goOffline(state, firstSession);
  const reports: DayReport[] = [];

  for (let day = 0; day < days; day++) {
    for (const [hour, minutes] of profile.sessions) {
      const start = t0 + day * DAY + hour * HOUR;
      const end = start + minutes * MINUTE;
      goOnline(state, start);
      for (let t = start; t < end; t += decisionEverySeconds * 1000) {
        advance(state, t);
        botPlay(state, t, t === start);
      }
      goOffline(state, end);
    }
    const endOfDay = t0 + (day + 1) * DAY - 1;
    advance(state, endOfDay);
    const online = cloneGame(state);
    online.lastSeenAt = null;
    reports.push({
      day: day + 1,
      rate: productionRate(online, endOfDay),
      biomass: state.biomass,
      nutrients: state.nutrients,
      tiles: [...state.tiles.values()].filter((t) => t.owner === state.id).length,
      upgrades: { ...state.upgrades },
    });
  }
  return reports;
}

/**
 * One bot decision: plan the queue, buy upgrades that pay back faster than tiles, move the Cœur.
 * Also drives the server's test robots.
 */
export function botPlay(state: GameState, now: number, sessionStart: boolean): void {
  if (sessionStart && now >= heartReadyAt(state)) moveHeartToCentre(state, now);
  fillQueue(state, now);
  buyUpgrades(state);
}

/** Expected biomass per second per nutrient spent on a wild tile. */
function tileValue(state: GameState, tile: Tile): number {
  const perSecond = tileYield(tile.terrain, state.upgrades) * richness(state, tile) * humidity(state, tile) * 0.6; // ~average exhaustion
  return (perSecond * conversionRate(state.upgrades)) / colonizationCost(state, tile);
}

/** Wild tiles next to the player's tiles or to tiles already planned (the only ones `colonize` accepts). */
function candidates(state: GameState): Tile[] {
  const seen = new Set<string>();
  const out: Tile[] = [];
  const sources = [...state.queue];
  for (const t of state.tiles.values()) if (t.owner === state.id) sources.push(t);
  for (const s of sources) {
    for (const n of hexNeighbors(s)) {
      const k = hexKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      const t = state.tiles.get(k);
      if (t && t.owner === null && TERRAIN_STATS[t.terrain].colonizable) out.push(t);
    }
  }
  return out;
}

function fillQueue(state: GameState, now: number): void {
  while (state.queue.length < QUEUE_MAX) {
    let best: Tile | null = null;
    let bestValue = -Infinity;
    for (const tile of candidates(state)) {
      if (!checkColonize(state, tile).ok) continue;
      const v = tileValue(state, tile);
      if (v > bestValue) {
        bestValue = v;
        best = tile;
      }
    }
    if (!best) return;
    colonize(state, best, now);
  }
}

function buyUpgrades(state: GameState): void {
  for (;;) {
    const nextTile = state.queue[0] ? state.tiles.get(hexKey(state.queue[0])) : undefined;
    const tileRoi = nextTile ? tileValue(state, nextTile) : 0;
    const production = productionRate(state);
    const conv = conversionRate(state.upgrades);
    let deadwood = 0;
    const hops = networkHops(state);
    for (const t of state.tiles.values()) if (t.terrain === "deadwood" && hops.has(hexKey(t))) deadwood += 3;
    const gains: Array<[UpgradeId, number]> = [
      ["digestion", (production * UPGRADE_STATS.digestion.perLevel * conv) / (1 + UPGRADE_STATS.digestion.perLevel * state.upgrades.digestion)],
      ["biomassConversion", production * 0.1 * UPGRADE_STATS.biomassConversion.perLevel],
      ["woodDecomposer", deadwood * UPGRADE_STATS.woodDecomposer.perLevel * conv * 0.5],
    ];
    let best: UpgradeId | null = null;
    let bestRoi = tileRoi;
    for (const [id, gain] of gains) {
      const roi = gain / upgradeCost(id, state.upgrades[id]);
      if (roi > bestRoi) {
        bestRoi = roi;
        best = id;
      }
    }
    // Cost cutters: bought when cheap compared with the savings.
    for (const id of ["thriftyExpansion", "hyphalGrowth"] as const) {
      if (upgradeCost(id, state.upgrades[id]) < state.nutrients * 0.1) buyUpgrade(state, id);
    }
    if (!best || !buyUpgrade(state, best).ok) return;
  }
}

/** Moves the Cœur to the colonised tile that minimises total transport hops. */
function moveHeartToCentre(state: GameState, now: number): void {
  const hops = networkHops(state);
  const tiles = [...hops.keys()];
  if (tiles.length < 10) return;
  let bestKey = hexKey(state.heart);
  let bestSum = [...hops.values()].reduce((a, b) => a + b, 0);
  for (const k of tiles) {
    const [q, r] = k.split(",").map(Number) as [number, number];
    const sum = sumHops(state, { q, r }, hops);
    if (sum < bestSum * 0.9) {
      bestSum = sum;
      bestKey = k;
    }
  }
  if (bestKey !== hexKey(state.heart)) {
    const [q, r] = bestKey.split(",").map(Number) as [number, number];
    moveHeart(state, { q, r }, now);
  }
}

function sumHops(state: GameState, from: { q: number; r: number }, network: Map<string, number>): number {
  const seen = new Set([hexKey(from)]);
  let frontier = [from];
  let sum = 0;
  for (let d = 1; frontier.length; d++) {
    const next: typeof frontier = [];
    for (const h of frontier) {
      for (const n of hexNeighbors(h)) {
        const k = hexKey(n);
        if (seen.has(k) || !network.has(k)) continue;
        seen.add(k);
        sum += d;
        next.push(n);
      }
    }
    frontier = next;
  }
  return sum;
}

/** Plain-text table of a simulation, for the CLI and CI logs. */
export function formatReport(reports: DayReport[]): string {
  const fmt = (n: number) => (n >= 1e4 ? n.toExponential(2) : n.toFixed(1));
  const rows = reports.map(
    (r) =>
      `  day ${r.day}  rate ${fmt(r.rate).padStart(9)}/s  biomass ${fmt(r.biomass).padStart(9)}  tiles ${String(r.tiles).padStart(3)}  upgrades ${Object.values(r.upgrades).join("/")}`,
  );
  return rows.join("\n");
}
