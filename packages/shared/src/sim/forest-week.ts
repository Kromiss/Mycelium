/**
 * Forest week simulation: robots with different schedules share one forest for a week, with the
 * real rules (economy, borders, protections). Used by `forest-week.test.ts` in CI and by
 * `pnpm --filter @mycelium/shared simulate:forest`.
 */
import { FOREST, TERRAIN_STATS, ZONES, type ActionId, type EventKind } from "../balance";
import { resolveEvents } from "../events";
import { botAct } from "./fight";
import { advanceForest, joinForest, newForest, resolveBorders, type CaptureEvent } from "../forest";
import { ringAt, zoneAt, type Ring } from "../forestgen";
import { goOffline, goOnline, networkHops, productionRate, type Tile } from "../game";
import { hexKey } from "../hex";
import { ownedTilesOf, topologyEpoch } from "../tile-index";
import { seasonAt } from "../season";
import { PROFILES, botPlay, defaultPlan, type BotPlan, type Profile } from "./week";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface ForestSimOptions {
  seed?: number;
  days?: number;
  capacity?: number;
  /** Simulation step; borders and economy are exact within a step, so 1 min is plenty. */
  stepMs?: number;
  /** Minutes between two decisions of a robot during its sessions. */
  decisionEveryMinutes?: number;
  /** Schedule of robot i: alternates by default between active and casual players. */
  profileOf?: (i: number) => Profile;
  /** Strain and mutation branches of robot i (from its id by default). */
  planOf?: (i: number, id: string) => BotPlan;
  /** M6: robots use the active actions (default true). */
  fight?: boolean;
  /** M6: the season's events happen (default true). */
  events?: boolean;
  /**
   * M9: stop as soon as this measure is known ("ninety": the forest is 90 % occupied, "full": 99.9 %), to
   * save time when only the pacing is wanted. The rest of the result stops there too.
   */
  stopAt?: "ninety" | "full";
}

export interface ForestSnapshot {
  /** Hours since the forest opened. */
  hour: number;
  /** Share of colonisable land owned by someone. */
  occupancy: number;
  captures: number;
  players: Array<{
    id: string;
    profile: string;
    strain: string;
    branch: string;
    tiles: number;
    biomass: number;
    rate: number;
    trophies: number;
  }>;
}

export interface ForestSimResult {
  radius: number;
  landTiles: number;
  /** Every 6 hours, from hour 0. */
  snapshots: ForestSnapshot[];
  captures: Array<CaptureEvent & { hour: number; ring: Ring }>;
  /** Final map, for pictures. */
  tiles: Array<{ q: number; r: number; terrain: string; owner: string | null; structure: string | null; connected: boolean }>;
  hearts: Record<string, { q: number; r: number }>;
  spawns: Record<string, { q: number; r: number }>;
  /** Hours at which the forest reached 50 %, 90 % and 100 % occupancy (null if never). */
  filled: { half: number | null; ninety: number | null; full: number | null };
  /** M6: actions used, Cœurs taken, tiles lost to events, and the world bosses. */
  conflict: ConflictStats;
  /**
   * M9: for each player, the first hour at which they held a grown tile of each zone (index 0 = zone 1),
   * null if never.
   */
  zones: Record<string, Array<number | null>>;
  /** Hour at which the simulation ended (earlier than `days` with `stopAt`). */
  endHour: number;
}

/** Final biomass of each schedule, and how far apart they are (GDD §9: at most ×6). */
export interface ScheduleGap {
  /** Mean final biomass by profile name. */
  mean: Record<string, number>;
  /** Most active profile's mean over the least active's. */
  ratio: number;
}

/** Final biomass by profile (schedule) of a forest week, and the gap between the extremes. */
export function scheduleGap(r: ForestSimResult): ScheduleGap {
  const last = r.snapshots[r.snapshots.length - 1]!;
  const by = new Map<string, number[]>();
  for (const p of last.players) by.set(p.profile, [...(by.get(p.profile) ?? []), p.biomass]);
  const mean = Object.fromEntries([...by].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
  const values = Object.values(mean);
  return { mean, ratio: Math.max(...values) / Math.max(1e-9, Math.min(...values)) };
}

/**
 * Hour at which each zone was first reached by the players of each profile (index 0 is zone 1): by the
 * first of them (`first`), and by half of them (`median`). Null where nobody (or not half) got there. The
 * inner zones are small: only a few colonies can touch the centre, so `first` is the measure for them.
 */
export function zoneReach(r: ForestSimResult): Record<string, { first: Array<number | null>; median: Array<number | null> }> {
  const last = r.snapshots[r.snapshots.length - 1]!;
  const out: Record<string, { first: Array<number | null>; median: Array<number | null> }> = {};
  for (const profile of new Set(last.players.map((p) => p.profile))) {
    const ids = last.players.filter((p) => p.profile === profile).map((p) => p.id);
    const sorted = (z: number) => ids.map((id) => r.zones[id]?.[z] ?? null).map((h) => (h === null ? Infinity : h)).sort((a, b) => a - b);
    const finite = (h: number) => (Number.isFinite(h) ? h : null);
    out[profile] = {
      first: Array.from({ length: ZONES.count }, (_, z) => finite(sorted(z)[0]!)),
      median: Array.from({ length: ZONES.count }, (_, z) => finite(sorted(z)[Math.floor((ids.length - 1) / 2)]!)),
    };
  }
  return out;
}

export interface ConflictStats {
  actions: Record<ActionId, number>;
  hearts: number;
  eventLosses: number;
  events: Partial<Record<EventKind, number>>;
  bosses: Array<{ hour: number; contributors: number; killed: boolean }>;
  /** Fewest tiles any player held at the end. */
  minTiles: number;
}

/** Alternates active (12 h/day) and casual (3 × 10 min/day) robots. */
export const MIXED_PROFILES = (i: number): Profile => (i % 2 === 0 ? PROFILES.hardcore : PROFILES.casual);

export function simulateForestWeek(options: ForestSimOptions = {}): ForestSimResult {
  const {
    seed = 20261005,
    days = 7,
    capacity = FOREST.capacity,
    stepMs = MINUTE,
    decisionEveryMinutes = 5,
    profileOf = MIXED_PROFILES,
    planOf = (_i: number, id: string) => defaultPlan(id),
    fight = true,
    events = true,
    stopAt,
  } = options;
  // The forest opens on Monday 00:00 Paris, like a real season (phases follow the calendar).
  const t0 = seasonAt(Date.UTC(2026, 9, 5, 12)).start;
  const forest = newForest(seed, t0, capacity);
  const profiles = new Map<string, Profile>();
  const plans = new Map<string, BotPlan>();
  const pending = Array.from({ length: capacity }, (_, i) => {
    const profile = profileOf(i);
    const id = `bot${String(i + 1).padStart(2, "0")}`;
    plans.set(id, planOf(i, id));
    // Everyone joins at the start of their first session on Monday.
    return { id, profile, at: t0 + profile.sessions[0]![0] * HOUR };
  });
  // Tiles bought with nutrients: wetlands need a mutation, Rock and Ruins are paid in Enzymes (M7 added
  // one Ruine per slice), and the pacing target is about the land everyone expands onto.
  const fillable = (t: Tile) => t.terrain !== "wetland" && !TERRAIN_STATS[t.terrain].paidInEnzymes;
  const land = [...forest.tiles.values()].filter(fillable).length;
  // Recounted only when a tile changed (M9 speed-up).
  let occupiedAt: { epoch: number | null; value: number } = { epoch: null, value: 0 };
  const occupied = () => {
    const epoch = topologyEpoch(forest.tiles);
    if (epoch !== null && occupiedAt.epoch === epoch) return occupiedAt.value;
    let n = 0;
    for (const p of forest.players.values()) for (const t of ownedTilesOf(forest.tiles, p.id)) if (fillable(t)) n++;
    occupiedAt = { epoch, value: n / land };
    return occupiedAt.value;
  };

  const online = (profile: Profile, t: number) => {
    const inDay = (t - t0) % DAY; // Paris wall-clock time of day (no DST change that week).
    return profile.sessions.some(([h, m]) => inDay >= h * HOUR && inDay < h * HOUR + m * MINUTE);
  };

  const captures: ForestSimResult["captures"] = [];
  const snapshots: ForestSnapshot[] = [];
  const filled: ForestSimResult["filled"] = { half: null, ninety: null, full: null };
  const snapshot = (t: number) => {
    const counts = new Map<string, number>();
    for (const tile of forest.tiles.values()) if (tile.owner) counts.set(tile.owner, (counts.get(tile.owner) ?? 0) + 1);
    snapshots.push({
      hour: (t - t0) / HOUR,
      occupancy: occupied(),
      captures: captures.length,
      players: [...forest.players.values()].map((p) => ({
        id: p.id,
        profile: profiles.get(p.id)!.name,
        strain: plans.get(p.id)!.strain ?? "none",
        branch: plans.get(p.id)!.branches[0] ?? "none",
        tiles: counts.get(p.id) ?? 0,
        biomass: p.biomass,
        rate: productionRate({ ...p, lastSeenAt: null }, t),
        trophies: p.trophies,
      })),
    });
  };

  const conflict: ConflictStats = { actions: { assault: 0, toxin: 0, cut: 0, siphon: 0 }, hearts: 0, eventLosses: 0, events: {}, bosses: [], minTiles: 0 };
  const wasOnline = new Map<string, boolean>();
  const zones: ForestSimResult["zones"] = {};
  /** Notes the zones each player holds a grown tile in (every hour). */
  const noteZones = (t: number) => {
    for (const p of forest.players.values()) {
      const reached = (zones[p.id] ??= Array.from({ length: ZONES.count }, () => null));
      for (const tile of ownedTilesOf(forest.tiles, p.id)) {
        if (tile.growthEndsAt !== null) continue;
        const z = zoneAt(forest.layout, forest.radius, tile) - 1;
        if (reached[z] === null) reached[z] = (t - t0) / HOUR;
      }
    }
  };
  let end = t0;
  for (let t = t0 + stepMs; t <= t0 + days * DAY; t += stepMs) {
    end = t;
    for (const j of pending.filter((x) => x.at <= t && !forest.players.has(x.id))) {
      joinForest(forest, j.id, t);
      profiles.set(j.id, j.profile);
    }
    // Players arrive and leave on their schedule; the forest runs for everyone.
    for (const p of forest.players.values()) {
      const on = online(profiles.get(p.id)!, t);
      const before = wasOnline.get(p.id) ?? false;
      if (on && !before) goOnline(p, t);
      if (!on && before) goOffline(p, t);
      wasOnline.set(p.id, on);
    }
    advanceForest(forest, t);
    for (const e of resolveBorders(forest, stepMs, t)) {
      captures.push({ ...e, hour: (t - t0) / HOUR, ring: ringAt(forest.radius, e) });
      if (e.heart) conflict.hearts++;
    }
    for (const o of events ? resolveEvents(forest, stepMs, t) : []) {
      conflict.eventLosses += o.lost.length;
      if (o.phase === "started") conflict.events[o.event.kind] = (conflict.events[o.event.kind] ?? 0) + 1;
      if (o.phase === "ended" && o.event.kind === "tree") {
        conflict.bosses.push({ hour: (t - t0) / HOUR, contributors: o.rewards.length, killed: o.event.killed === true });
      }
    }
    if ((t - t0) % (decisionEveryMinutes * MINUTE) === 0) {
      for (const p of forest.players.values()) {
        const profile = profiles.get(p.id)!;
        if (!online(profile, t)) continue;
        const sessionStart = !online(profile, t - decisionEveryMinutes * MINUTE);
        botPlay(p, t, sessionStart, plans.get(p.id));
        const used = fight ? botAct(forest, p, t) : null;
        if (used) conflict.actions[used.action]++;
      }
    }
    const occ = occupied();
    const hour = (t - t0) / HOUR;
    if (filled.half === null && occ >= 0.5) filled.half = hour;
    if (filled.ninety === null && occ >= 0.9) filled.ninety = hour;
    if (filled.full === null && occ >= 0.999) filled.full = hour;
    if ((t - t0) % HOUR === 0) noteZones(t);
    if ((t - t0) % (6 * HOUR) === 0) snapshot(t);
    if ((stopAt === "ninety" && filled.ninety !== null) || (stopAt === "full" && filled.full !== null)) {
      if ((t - t0) % (6 * HOUR) !== 0) snapshot(t);
      break;
    }
  }

  return {
    radius: forest.radius,
    landTiles: land,
    snapshots,
    captures,
    tiles: [...forest.tiles.values()].map((t) => ({
      q: t.q,
      r: t.r,
      terrain: t.terrain,
      owner: t.owner,
      structure: t.structure,
      connected: t.owner !== null && networkHops(forest.players.get(t.owner)!).has(hexKey(t)),
    })),
    hearts: Object.fromEntries([...forest.players.values()].map((p) => [p.id, { ...p.heart }])),
    spawns: Object.fromEntries([...forest.players.values()].map((p) => [p.id, { ...p.spawn }])),
    filled,
    zones,
    endHour: (end - t0) / HOUR,
    conflict: { ...conflict, minTiles: Math.min(...[...forest.players.keys()].map((id) => [...forest.tiles.values()].filter((x) => x.owner === id).length)) },
  };
}

/** Plain-text summary, one line per day. */
export function formatForestReport(r: ForestSimResult): string {
  const lines = [
    `forest radius ${r.radius}, ${r.landTiles} land tiles; 50 % at ${fmtH(r.filled.half)}, 90 % at ${fmtH(r.filled.ninety)}, full at ${fmtH(r.filled.full)}`,
  ];
  const c = r.conflict;
  lines.push(
    `  actions ${Object.entries(c.actions).map(([k, v]) => `${k} ${v}`).join(", ")}; hearts taken ${c.hearts}; tiles lost to events ${c.eventLosses}; ` +
      `events ${Object.entries(c.events).map(([k, v]) => `${k} ${v}`).join(", ")}; ` +
      `bosses ${c.bosses.map((b) => `h${b.hour.toFixed(0)}: ${b.contributors} players${b.killed ? ", killed" : ""}`).join("; ") || "none"}; fewest tiles at the end ${c.minTiles}`,
  );
  const gap = scheduleGap(r);
  lines.push(`  final biomass by schedule: ${Object.entries(gap.mean).map(([k, v]) => `${k} ${v.toExponential(2)}`).join(", ")}; gap ×${gap.ratio.toFixed(1)}`);
  const day = (h: number | null) => (h === null ? "never" : (h / 24).toFixed(1));
  for (const [profile, reach] of Object.entries(zoneReach(r))) {
    lines.push(`  zones reached (${profile}), day of the first / of half: ${reach.first.map((h, i) => `z${i + 1} ${day(h)}/${day(reach.median[i]!)}`).join(", ")}`);
  }
  for (const s of r.snapshots.filter((x) => x.hour % 24 === 0 && x.hour > 0)) {
    const tiles = s.players.map((p) => p.tiles);
    const bio = s.players.map((p) => p.biomass);
    lines.push(
      `  day ${s.hour / 24}: occupied ${(s.occupancy * 100).toFixed(0).padStart(3)} %  tiles ${Math.min(...tiles)}..${Math.max(...tiles)}  biomass ${Math.min(...bio).toExponential(1)}..${Math.max(...bio).toExponential(1)}  captures ${s.captures}`,
    );
  }
  return lines.join("\n");
}

function fmtH(h: number | null): string {
  return h === null ? "never" : `day ${(h / 24).toFixed(1)} (${h.toFixed(0)} h)`;
}
