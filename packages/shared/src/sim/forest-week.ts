/**
 * Forest week simulation: robots with different schedules share one forest for a week, with the
 * real rules (economy, borders, protections). Used by `forest-week.test.ts` in CI and by
 * `pnpm --filter @mycelium/shared simulate:forest`.
 */
import { FOREST, TERRAIN_STATS, type ActionId, type EventKind } from "../balance";
import { resolveEvents } from "../events";
import { botAct } from "./fight";
import { advanceForest, joinForest, newForest, resolveBorders, type CaptureEvent } from "../forest";
import { ringAt, type Ring } from "../forestgen";
import { goOffline, goOnline, networkHops, productionRate, type Tile } from "../game";
import { hexKey } from "../hex";
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
  tiles: Array<{ q: number; r: number; terrain: string; owner: string | null; exhaustion: number; structure: string | null; connected: boolean }>;
  hearts: Record<string, { q: number; r: number }>;
  spawns: Record<string, { q: number; r: number }>;
  /** Hours at which the forest reached 50 %, 90 % and 100 % occupancy (null if never). */
  filled: { half: number | null; ninety: number | null; full: number | null };
  /** M6: actions used, Cœurs taken, tiles lost to events, and the world bosses. */
  conflict: ConflictStats;
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
  const occupied = () => [...forest.tiles.values()].filter((t) => t.owner !== null && fillable(t)).length / land;

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
  for (let t = t0 + stepMs; t <= t0 + days * DAY; t += stepMs) {
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
    if ((t - t0) % (6 * HOUR) === 0) snapshot(t);
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
      exhaustion: t.exhaustion,
      structure: t.structure,
      connected: t.owner !== null && networkHops(forest.players.get(t.owner)!).has(hexKey(t)),
    })),
    hearts: Object.fromEntries([...forest.players.values()].map((p) => [p.id, { ...p.heart }])),
    spawns: Object.fromEntries([...forest.players.values()].map((p) => [p.id, { ...p.spawn }])),
    filled,
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
