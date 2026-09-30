/**
 * Profile study: robots with different schedules and aims share a forest for a week, with the real
 * rules. Schedules: "always" (online 24/7, a decision every 5 min) and "every3h" (one decision every
 * 3 h of real time, offline in between). Aims (see `BotPlan.aim`): "centre" goes for the rich middle,
 * "home" keeps to its own slice. Profiles rotate over the seats from one forest to the next, so that
 * over `profiles.length` forests of the same seed every profile plays every slice once.
 * Used by `profiles.test.ts` and `pnpm --filter @mycelium/shared simulate:profiles`.
 */
import { FOREST } from "../balance";
import { resolveEvents } from "../events";
import { botAct } from "./fight";
import { advanceForest, joinForest, newForest, resolveBorders } from "../forest";
import { ringAt, type Ring } from "../forestgen";
import { goOffline, goOnline, networkHops, productionRate } from "../game";
import { seasonAt } from "../season";
import { botPlay, defaultPlan, type BotPlan } from "./week";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Schedule = "always" | "every3h";
export type Aim = NonNullable<BotPlan["aim"]>;

export interface BotProfile {
  key: string;
  schedule: Schedule;
  aim: Aim;
}

/** The four profiles of the first study (30 Sept 2026): 3 robots of each in a forest of 12. */
export const STUDY_PROFILES: readonly BotProfile[] = [
  { key: "always-centre", schedule: "always", aim: "centre" },
  { key: "every3h-home", schedule: "every3h", aim: "home" },
  { key: "always-home", schedule: "always", aim: "home" },
  { key: "every3h-centre", schedule: "every3h", aim: "centre" },
];

/** Length of an "every3h" session: exactly one decision. */
const SHORT_SESSION_MS = 5 * MINUTE;
const DECISION_MS = 5 * MINUTE;

export function isOnline(schedule: Schedule, msSinceMidnight: number): boolean {
  return schedule === "always" || msSinceMidnight % (3 * HOUR) < SHORT_SESSION_MS;
}

export interface ProfileSimOptions {
  seed?: number;
  days?: number;
  capacity?: number;
  /** Simulation step; 1 min is exact enough for the borders. */
  stepMs?: number;
  profiles?: readonly BotProfile[];
  /** Shifts the profiles over the seats (play `profiles.length` rotations to cancel the map out). */
  rotation?: number;
  /** Hours between two snapshots. */
  snapshotEveryHours?: number;
}

export interface ProfileRow {
  hour: number;
  occupancy: number;
  id: string;
  profile: string;
  strain: string;
  branch: string;
  tiles: number;
  tilesByRing: Record<Ring, number>;
  connected: number;
  biomass: number;
  rate: number;
  trophies: number;
  gained: number;
  lost: number;
  mutations: number;
  fruitings: number;
}

export interface ProfileSimResult {
  seed: number;
  rotation: number;
  radius: number;
  landTiles: number;
  players: Array<{ id: string; profile: string; spawn: { q: number; r: number }; heart: { q: number; r: number }; plan: BotPlan }>;
  rows: ProfileRow[];
  captures: Array<{ hour: number; q: number; r: number; from: string; to: string; ring: Ring }>;
  /** Owner of every tile at the end of each day (day 0 = opening), for pictures. */
  maps: Array<{ day: number; tiles: Array<[q: number, r: number, terrain: string, owner: string | null]> }>;
}

export function simulateProfiles(options: ProfileSimOptions = {}): ProfileSimResult {
  const {
    seed = 20261005,
    days = 7,
    capacity = FOREST.capacity,
    stepMs = MINUTE,
    profiles = STUDY_PROFILES,
    rotation = 0,
    snapshotEveryHours = 3,
  } = options;
  const t0 = seasonAt(Date.UTC(2026, 9, 5, 12)).start; // Monday 00:00 Paris.
  const forest = newForest(seed, t0, capacity);
  const profileOf = new Map<string, BotProfile>();
  const plans = new Map<string, BotPlan>();
  // Everyone joins at the opening, in seat order (joinForest spreads the seats over the slices).
  for (let i = 0; i < capacity; i++) {
    const id = `bot${String(i + 1).padStart(2, "0")}`;
    const profile = profiles[(i + rotation) % profiles.length]!;
    profileOf.set(id, profile);
    // The strain and branches stay with the seat, so they rotate over the profiles too.
    plans.set(id, { ...defaultPlan(`${id}-${seed}`), aim: profile.aim });
    joinForest(forest, id, t0);
  }
  const landTiles = [...forest.tiles.values()].filter((t) => t.terrain !== "wetland").length;
  const tally = new Map([...profileOf.keys()].map((id) => [id, { gained: 0, lost: 0 }]));
  const rows: ProfileRow[] = [];
  const captures: ProfileSimResult["captures"] = [];
  const maps: ProfileSimResult["maps"] = [];
  const wasOnline = new Map<string, boolean>();

  const snapshot = (t: number) => {
    const byRing = new Map<string, Record<Ring, number>>();
    let owned = 0;
    for (const tile of forest.tiles.values()) {
      if (!tile.owner) continue;
      if (tile.terrain !== "wetland") owned++;
      const c = byRing.get(tile.owner) ?? { rim: 0, middle: 0, centre: 0 };
      c[ringAt(forest.radius, tile)]++;
      byRing.set(tile.owner, c);
    }
    for (const p of forest.players.values()) {
      const tilesByRing = byRing.get(p.id) ?? { rim: 0, middle: 0, centre: 0 };
      rows.push({
        hour: (t - t0) / HOUR,
        occupancy: owned / landTiles,
        id: p.id,
        profile: profileOf.get(p.id)!.key,
        strain: plans.get(p.id)!.strain ?? "none",
        branch: plans.get(p.id)!.branches[0] ?? "none",
        tiles: tilesByRing.rim + tilesByRing.middle + tilesByRing.centre,
        tilesByRing,
        connected: networkHops(p).size,
        biomass: p.biomass,
        rate: productionRate({ ...p, lastSeenAt: null }, t),
        trophies: p.trophies,
        ...tally.get(p.id)!,
        mutations: p.mutations.length,
        fruitings: p.fruitings,
      });
    }
  };
  const mapSnapshot = (t: number) =>
    maps.push({ day: (t - t0) / DAY, tiles: [...forest.tiles.values()].map((x) => [x.q, x.r, x.terrain, x.owner]) });

  snapshot(t0);
  mapSnapshot(t0);
  for (let t = t0 + stepMs; t <= t0 + days * DAY; t += stepMs) {
    const inDay = (t - t0) % DAY; // Paris wall-clock time of day (no DST change that week).
    for (const p of forest.players.values()) {
      const on = isOnline(profileOf.get(p.id)!.schedule, inDay);
      const before = wasOnline.get(p.id) ?? false;
      if (on && !before) goOnline(p, t);
      if (!on && before) goOffline(p, t);
      wasOnline.set(p.id, on);
    }
    advanceForest(forest, t);
    for (const e of resolveBorders(forest, stepMs, t)) {
      tally.get(e.to)!.gained++;
      tally.get(e.from)!.lost++;
      captures.push({ ...e, hour: (t - t0) / HOUR, ring: ringAt(forest.radius, e) });
    }
    resolveEvents(forest, stepMs, t);
    if ((t - t0) % DECISION_MS === 0) {
      for (const p of forest.players.values()) {
        const { schedule } = profileOf.get(p.id)!;
        if (!isOnline(schedule, inDay)) continue;
        // Each short session is a new session; the always-online robot starts one a day.
        botPlay(p, t, schedule === "every3h" || inDay === 0, plans.get(p.id));
        botAct(forest, p, t);
      }
    }
    if ((t - t0) % (snapshotEveryHours * HOUR) === 0) snapshot(t);
    if ((t - t0) % DAY === 0) mapSnapshot(t);
  }

  return {
    seed,
    rotation,
    radius: forest.radius,
    landTiles,
    players: [...forest.players.values()].map((p) => ({
      id: p.id,
      profile: profileOf.get(p.id)!.key,
      spawn: { ...p.spawn },
      heart: { ...p.heart },
      plan: plans.get(p.id)!,
    })),
    rows,
    captures,
    maps,
  };
}

export interface ProfileSummary {
  profile: string;
  robots: number;
  /** Median of (robot's final biomass / its forest's mean biomass). */
  medianShare: number;
  /** Average final rank (1 = first). */
  rank: number;
  wins: number;
  top3: number;
  tiles: number;
  gained: number;
  lost: number;
}

/** Final standings by profile, over one or more forests. */
export function summarizeProfiles(results: readonly ProfileSimResult[]): ProfileSummary[] {
  const finals = results.flatMap((r) => {
    const end = Math.max(...r.rows.map((x) => x.hour));
    const last = r.rows.filter((x) => x.hour === end);
    const mean = last.reduce((s, x) => s + x.biomass, 0) / last.length || 1;
    const ranked = [...last].sort((a, b) => b.biomass - a.biomass);
    return last.map((x) => ({ ...x, share: x.biomass / mean, rank: ranked.indexOf(x) + 1 }));
  });
  const keys = [...new Set(finals.map((x) => x.profile))];
  return keys.map((profile) => {
    const g = finals.filter((x) => x.profile === profile);
    const avg = (f: (x: (typeof g)[number]) => number) => g.reduce((s, x) => s + f(x), 0) / g.length;
    const shares = g.map((x) => x.share).sort((a, b) => a - b);
    return {
      profile,
      robots: g.length,
      medianShare: shares[Math.floor(shares.length / 2)]!,
      rank: avg((x) => x.rank),
      wins: g.filter((x) => x.rank === 1).length,
      top3: g.filter((x) => x.rank <= 3).length,
      tiles: avg((x) => x.tiles),
      gained: avg((x) => x.gained),
      lost: avg((x) => x.lost),
    };
  });
}

export function formatProfileSummary(rows: readonly ProfileSummary[]): string {
  return rows
    .map(
      (r) =>
        `  ${r.profile.padEnd(16)} share ${r.medianShare.toFixed(2)}  rank ${r.rank.toFixed(1).padStart(4)}  wins ${String(r.wins).padStart(2)}  top3 ${String(r.top3).padStart(2)}  tiles ${r.tiles.toFixed(0).padStart(3)}  taken ${r.gained.toFixed(1)} / lost ${r.lost.toFixed(1)}`,
    )
    .join("\n");
}
