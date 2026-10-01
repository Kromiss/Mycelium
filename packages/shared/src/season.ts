/**
 * Weekly seasons (GDD §1, §7): a season starts on Monday 00:00 Europe/Paris, each day is a phase
 * with its own modifiers, the leaderboard freezes on Sunday 23:59 and the forest is wiped on the
 * next Monday 00:00. Everything here is computed from the absolute time, so the server and the
 * client agree without talking about it.
 */

const DAY = 86_400_000;
export const SEASON_TIME_ZONE = "Europe/Paris";
/** The leaderboard freezes this long before the wipe (GDD §7: Sunday 23:59). */
export const FREEZE_BEFORE_WIPE_MS = 60_000;

export const PHASE_IDS = ["germination", "spring", "summer", "fall", "autumn", "frost", "decay"] as const;
/** Monday to Sunday (GDD §7). */
export type PhaseId = (typeof PHASE_IDS)[number];

export interface PhaseEffects {
  /** Multiplies hyphae growth time (0.5 = twice as fast). */
  growthTime: number;
  /** Multiplies the production of every tile. */
  production: number;
  /** Production multiplier for tiles next to a wetland (replaces `production` when set). */
  wetProduction: number | null;
  /** Extra multiplier on Dead wood yield. */
  deadwood: number;
  /** Multiplies colonisation costs. */
  colonizationCost: number;
  /** Multiplies biomass gains (the score). */
  biomass: number;
  /** Multiplies border capture speed; 0 = no PvP. */
  captureSpeed: number;
}

/** No modifier (solo games, tests). */
export const NEUTRAL_EFFECTS: PhaseEffects = {
  growthTime: 1,
  production: 1,
  wetProduction: null,
  deadwood: 1,
  colonizationCost: 1,
  biomass: 1,
  captureSpeed: 1,
};

/** DECIDED (owner, M4): the proposed package. */
export const PHASE_EFFECTS: Readonly<Record<PhaseId, PhaseEffects>> = {
  /** Lundi — Germination: everything grows twice as fast, no PvP. */
  germination: { ...NEUTRAL_EFFECTS, growthTime: 0.5, captureSpeed: 0 },
  /** Mardi — Printemps: frequent rain, +20 % production. */
  spring: { ...NEUTRAL_EFFECTS, production: 1.2 },
  /** Mercredi — Été: drought, −25 % production except next to wetlands. */
  summer: { ...NEUTRAL_EFFECTS, production: 0.75, wetProduction: 1 },
  /** Jeudi — Chute: conflict peak, captures twice as fast. */
  fall: { ...NEUTRAL_EFFECTS, captureSpeed: 2 },
  /** Vendredi — Automne: litter and dead wood everywhere, −30 % colonisation cost, Dead wood +50 %. */
  autumn: { ...NEUTRAL_EFFECTS, colonizationCost: 0.7, deadwood: 1.5 },
  /** Samedi — Gel: −30 % production, defence ×2 (captures twice as slow). */
  frost: { ...NEUTRAL_EFFECTS, production: 0.7, captureSpeed: 0.5 },
  /** Dimanche — Décomposition finale: biomass ×1.5, unstable borders (captures 1.5× faster). */
  decay: { ...NEUTRAL_EFFECTS, biomass: 1.5, captureSpeed: 1.5 },
};

/** After the freeze nothing counts any more until the wipe. */
export const FROZEN_EFFECTS: PhaseEffects = { ...NEUTRAL_EFFECTS, biomass: 0, captureSpeed: 0 };

/** GDD §8.2: starting bonus by previous rank, Monday only. */
export const MONDAY_BONUS = { top10: 0.1, top50: 0.05, participant: 0.02 } as const;

export function mondayBonusFor(previous: { rank: number; players: number } | null): number {
  if (!previous || previous.players <= 0) return 0;
  const share = previous.rank / previous.players;
  if (share <= 0.1) return MONDAY_BONUS.top10;
  if (share <= 0.5) return MONDAY_BONUS.top50;
  return MONDAY_BONUS.participant;
}

// ---------------------------------------------------------------------------
// Calendar (Europe/Paris, DST-aware, without dependencies)

let formatter: Intl.DateTimeFormat | null = null;

/** Local wall-clock parts of an instant in Paris. */
function parisParts(utc: number): { y: number; m: number; d: number; h: number; min: number; s: number } {
  formatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SEASON_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(utc))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour! % 24, min: p.minute!, s: p.second! };
}

/** Paris offset from UTC at an instant, in ms (1 h in winter, 2 h in summer). */
function parisOffset(utc: number): number {
  const p = parisParts(utc);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(utc / 1000) * 1000;
}

/** UTC instant of local midnight in Paris for a local calendar date (month 1–12; day may overflow). */
function parisMidnight(y: number, m: number, d: number): number {
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall - parisOffset(wall);
  guess = wall - parisOffset(guess);
  return guess;
}

export interface SeasonBounds {
  /** Monday 00:00 Paris. */
  start: number;
  /** Start of each day (index 0 = Monday) and, at index 7, the next Monday = the wipe. */
  days: readonly number[];
  /** Sunday 23:59 Paris: the leaderboard is frozen from here. */
  freezeAt: number;
  /** Next Monday 00:00 Paris: the forest is wiped. */
  end: number;
  /** ISO week number and year of the season, e.g. "Semaine 38" (GDD §8.2). */
  week: number;
  year: number;
}

const boundsCache = new Map<number, SeasonBounds>();

/** The season that contains `t`. */
export function seasonAt(t: number): SeasonBounds {
  const cached = boundsCache.get(Math.floor(t / DAY));
  if (cached && t >= cached.start && t < cached.end) return cached;
  const p = parisParts(t);
  const dow = (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7; // Monday = 0
  const mondayDay = p.d - dow;
  const days = Array.from({ length: 8 }, (_, i) => parisMidnight(p.y, p.m, mondayDay + i));
  const { week, year } = isoWeek(Date.UTC(p.y, p.m - 1, mondayDay));
  const bounds: SeasonBounds = { start: days[0]!, days, freezeAt: days[7]! - FREEZE_BEFORE_WIPE_MS, end: days[7]!, week, year };
  boundsCache.set(Math.floor(t / DAY), bounds);
  if (boundsCache.size > 64) boundsCache.delete(boundsCache.keys().next().value!);
  return bounds;
}

/** Phase (day of the season) at `t`, and its effects (neutral effects are never returned after the freeze). */
export function phaseAt(t: number): { id: PhaseId; index: number; effects: PhaseEffects; frozen: boolean; endsAt: number } {
  // The last answer holds until its phase ends (M9 speed-up: called for every tile).
  if (lastPhase && t >= lastPhase.from && t < lastPhase.value.endsAt) return { ...lastPhase.value };
  const value = computePhase(t);
  const s = seasonAt(t);
  const from = value.frozen ? s.freezeAt : s.days[value.index]!;
  lastPhase = { from, value };
  return { ...value };
}

let lastPhase: { from: number; value: ReturnType<typeof computePhase> } | null = null;

function computePhase(t: number): { id: PhaseId; index: number; effects: PhaseEffects; frozen: boolean; endsAt: number } {
  const s = seasonAt(t);
  let index = 0;
  while (index < 6 && t >= s.days[index + 1]!) index++;
  const id = PHASE_IDS[index]!;
  if (t >= s.freezeAt) return { id, index, effects: FROZEN_EFFECTS, frozen: true, endsAt: s.end };
  return { id, index, effects: PHASE_EFFECTS[id], frozen: false, endsAt: index === 6 ? s.freezeAt : s.days[index + 1]! };
}

/** Next instant strictly after `t` when the effects change (a midnight, or the freeze). */
export function nextPhaseChange(t: number): number {
  return phaseAt(t).endsAt;
}

/** ISO 8601 week of a UTC date (a Monday, here). */
function isoWeek(utcDate: number): { week: number; year: number } {
  const d = new Date(utcDate);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / DAY;
  return { week: 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7), year };
}
