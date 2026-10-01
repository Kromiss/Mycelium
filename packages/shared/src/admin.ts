/**
 * Hidden administration of test forests (M9): admins (ADMIN_NAMES) launch forests with preset settings
 * (robots, speed, seed…), watch or join them, jump to a day, give themselves resources. Only in local
 * development and on staging: the server refuses every admin request in production, whatever the client
 * sends. Test forests stay out of the leaderboards, leagues and rewards, and live in memory only.
 */

/** Settings of a new test forest. */
export interface TestForestSettings {
  /** Shown in the admin page. */
  name: string;
  /** Map seed; random when omitted. */
  seed?: number;
  /** Robots that join at once (0 to the forest's capacity). */
  bots: number;
  /** Game time runs this many times faster than real time (1 to 3600). */
  timeScale: number;
  /** Colonies the forest holds (2 to 12). */
  capacity: number;
  /** Day of the season the forest opens on: 0 = Monday … 6 = Sunday. */
  startDay: number;
  /** No human may join: robots only, to watch a week go by. */
  robotsOnly: boolean;
  /** The admin joins it at once as a player. */
  withMe: boolean;
}

export const TEST_FOREST_LIMITS = {
  maxForests: 6,
  maxTimeScale: 3600,
  minCapacity: 2,
  maxCapacity: 12,
} as const;

/** Presets offered by the admin page (any field can then be changed). */
export const TEST_FOREST_PRESETS: Readonly<Record<"week" | "robots" | "duel" | "quick", Omit<TestForestSettings, "name" | "seed">>> = {
  /** A full forest of robots, with the admin, at ×60 (a week in under 3 hours). */
  week: { bots: 11, timeScale: 60, capacity: 12, startDay: 0, robotsOnly: false, withMe: true },
  /** Robots only, at ×600 (a week in about 17 minutes), to watch. */
  robots: { bots: 12, timeScale: 600, capacity: 12, startDay: 0, robotsOnly: true, withMe: false },
  /** The admin against one robot, at ×30, from Tuesday (PvP on). */
  duel: { bots: 1, timeScale: 30, capacity: 2, startDay: 1, robotsOnly: false, withMe: true },
  /** A few robots at ×3600 (an hour a second), to test a late phase quickly. */
  quick: { bots: 5, timeScale: 3600, capacity: 6, startDay: 0, robotsOnly: false, withMe: true },
};

/** Checks settings sent by a client; null if anything is off. */
export function parseTestForestSettings(raw: unknown): TestForestSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
  if (typeof s.name !== "string" || s.name.trim().length === 0 || s.name.length > 40) return null;
  if (s.seed !== undefined && !int(s.seed, 0, 0xffff_ffff)) return null;
  if (!int(s.capacity, TEST_FOREST_LIMITS.minCapacity, TEST_FOREST_LIMITS.maxCapacity)) return null;
  if (!int(s.bots, 0, s.capacity as number)) return null;
  if (typeof s.timeScale !== "number" || !(s.timeScale >= 1 && s.timeScale <= TEST_FOREST_LIMITS.maxTimeScale)) return null;
  if (!int(s.startDay, 0, 6)) return null;
  if (typeof s.robotsOnly !== "boolean" || typeof s.withMe !== "boolean") return null;
  if (s.robotsOnly && s.withMe) return null;
  if (!s.robotsOnly && s.withMe && (s.bots as number) >= (s.capacity as number)) return null;
  return {
    name: s.name.trim(),
    ...(s.seed !== undefined ? { seed: s.seed as number } : {}),
    bots: s.bots as number,
    timeScale: s.timeScale,
    capacity: s.capacity as number,
    startDay: s.startDay as number,
    robotsOnly: s.robotsOnly,
    withMe: s.withMe,
  };
}

/** What the admin may ask (sent as `{ type: "admin", op: … }`). */
export type AdminOp =
  | { op: "list" }
  | { op: "create"; settings: TestForestSettings }
  | { op: "pause"; forest: string }
  | { op: "resume"; forest: string }
  | { op: "erase"; forest: string }
  | { op: "speed"; forest: string; timeScale: number }
  /** Simulates the forest up to the start of a day (0 = Monday … 6 = Sunday) of its season. */
  | { op: "jump"; forest: string; day: number }
  /** Resources for the admin's own colony in the test forest they play in. */
  | { op: "give"; nutrients?: number; enzymes?: number; spores?: number; biomass?: number }
  /** Plays in a test forest (null: back to the admin's own forest). */
  | { op: "play"; forest: string | null }
  /** Watches a test forest through a robot's eyes, without acting (null: stop). */
  | { op: "follow"; forest: string | null; bot?: string };

export type AdminError = "forbidden" | "unknown_forest" | "too_many" | "invalid" | "busy" | "not_playing" | "full";

export interface AdminPlayer {
  id: string;
  name: string;
  bot: boolean;
  tiles: number;
  biomass: number;
  /** Innermost zone where the colony holds a grown tile (1 to 7). */
  zone: number;
  /** Useful actions per minute of game time over the last hour. */
  apm: number;
}

export interface AdminForest {
  id: string;
  number: number;
  name: string;
  status: "running" | "paused" | "jumping" | "over";
  seed: number;
  settings: TestForestSettings;
  /** Game time of the forest (ms since epoch), its day (0–6) and phase. */
  gameTime: number;
  day: number;
  /** Share of the colonisable land owned by someone (0 to 1). */
  occupancy: number;
  /** Useful actions per minute of game time over the last hour, robots and humans. */
  apm: { bots: number; humans: number };
  players: AdminPlayer[];
  /** Jump in progress: where it is going (game time). */
  jumpTarget?: number;
}

/** The admin page's view, sent after every admin request (and on demand with `list`). */
export interface AdminState {
  /** Admin tools are available on this server (local or staging). */
  tools: boolean;
  forests: AdminForest[];
  /** The test forest the admin plays in, null in their own forest. */
  playing: string | null;
  /** The test forest and robot the admin is watching, null when not watching. */
  following: { forest: string; bot: string } | null;
}

export function parseAdminOp(m: Record<string, unknown>): AdminOp | null {
  const id = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
  const amount = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e300);
  switch (m.op) {
    case "list":
      return { op: "list" };
    case "create": {
      const settings = parseTestForestSettings(m.settings);
      return settings ? { op: "create", settings } : null;
    }
    case "pause":
    case "resume":
    case "erase":
      return id(m.forest) ? { op: m.op, forest: m.forest } : null;
    case "speed":
      return id(m.forest) && typeof m.timeScale === "number" && m.timeScale >= 1 && m.timeScale <= TEST_FOREST_LIMITS.maxTimeScale
        ? { op: "speed", forest: m.forest, timeScale: m.timeScale }
        : null;
    case "jump":
      return id(m.forest) && typeof m.day === "number" && Number.isInteger(m.day) && m.day >= 0 && m.day <= 6 ? { op: "jump", forest: m.forest, day: m.day } : null;
    case "give": {
      if (![m.nutrients, m.enzymes, m.spores, m.biomass].every(amount)) return null;
      const out: AdminOp = { op: "give" };
      for (const k of ["nutrients", "enzymes", "spores", "biomass"] as const) if (typeof m[k] === "number") out[k] = m[k] as number;
      return out;
    }
    case "play":
      return m.forest === null || id(m.forest) ? { op: "play", forest: m.forest as string | null } : null;
    case "follow":
      if (m.forest === null) return { op: "follow", forest: null };
      return id(m.forest) && (m.bot === undefined || id(m.bot)) ? { op: "follow", forest: m.forest, ...(m.bot !== undefined ? { bot: m.bot as string } : {}) } : null;
    default:
      return null;
  }
}
