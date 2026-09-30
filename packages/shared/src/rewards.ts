/**
 * Season rankings, leagues and rewards (GDD §8; M7, DECIDED: the proposed package, numbers to balance).
 * Pure rules: the server computes the standings of a finished forest with them and keeps the result on
 * the accounts.
 */
import { STRAIN_IDS, type StrainId } from "./balance";

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// Leagues (GDD §8.3)

export const LEAGUES = ["bronze", "silver", "gold", "diamond", "primordial"] as const;
export type LeagueId = (typeof LEAGUES)[number];

export const LEAGUE_RULES = {
  /** The first `promote` of a forest go up a league, the last `demote` go down (fewer in small forests). */
  promote: 3,
  demote: 3,
  /** Every `absenceWeeks` weeks without playing cost a league. */
  absenceWeeks: 2,
} as const;

export function leagueId(league: number): LeagueId {
  return LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, Math.round(league)))]!;
}

/**
 * The league after a season: up for the first 3, down for the last 3. In a forest of fewer than 6
 * colonies, at most half go up and half go down, so nobody is both.
 */
export function leagueAfter(league: number, rank: number, players: number): number {
  const up = Math.min(LEAGUE_RULES.promote, Math.floor(players / 2));
  const down = Math.min(LEAGUE_RULES.demote, Math.floor(players / 2));
  if (rank <= up) return Math.min(LEAGUES.length - 1, league + 1);
  if (rank > players - down) return Math.max(0, league - 1);
  return league;
}

/** The league after weeks without playing: one lower every two missed weeks. */
export function leagueAfterAbsence(league: number, missedWeeks: number): number {
  return Math.max(0, league - Math.floor(Math.max(0, missedWeeks) / LEAGUE_RULES.absenceWeeks));
}

// ---------------------------------------------------------------------------
// Secondary leaderboards (GDD §8.1)

export const SECONDARY_BOARDS = ["territory", "conquests", "boss", "efficiency"] as const;
export type SecondaryBoard = (typeof SECONDARY_BOARDS)[number];

/** Efficiency counts only for colonies with at least this much active play. */
export const EFFICIENCY_MIN_ACTIVE_MS = 1 * HOUR;
/** An action in the last 10 minutes makes connected time active. */
export const ACTIVE_WINDOW_MS = 10 * 60_000;

/** What a colony did in a season, for every leaderboard. */
export interface SeasonLine {
  playerId: string;
  biomass: number;
  trophies: number;
  tiles: number;
  /** Tiles taken from other colonies. */
  conquests: number;
  /** Damage done to the Dying trees (world boss). */
  boss: number;
  /** Active play, in ms. */
  activeMs: number;
  fruitings: number;
}

/** Biomass per active hour, or null below an hour of active play. */
export function efficiency(line: Pick<SeasonLine, "biomass" | "activeMs">): number | null {
  return line.activeMs >= EFFICIENCY_MIN_ACTIVE_MS ? line.biomass / (line.activeMs / HOUR) : null;
}

export interface BoardRow {
  rank: number;
  playerId: string;
  value: number;
}

/** A secondary leaderboard: colonies with a value (and more than zero), best first. */
export function secondaryBoard(lines: readonly SeasonLine[], board: SecondaryBoard): BoardRow[] {
  const value = (l: SeasonLine): number | null => {
    switch (board) {
      case "territory":
        return l.tiles;
      case "conquests":
        return l.conquests;
      case "boss":
        return l.boss;
      case "efficiency":
        return efficiency(l);
    }
  };
  return lines
    .map((l) => ({ playerId: l.playerId, value: value(l) }))
    .filter((r): r is { playerId: string; value: number } => r.value !== null && r.value > 0)
    .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId))
    .map((r, i) => ({ rank: i + 1, ...r }));
}

// ---------------------------------------------------------------------------
// Rewards kept after the wipe (GDD §8.2): titles, network colours, Carpophore skins, strains

export const TITLE_IDS = ["champion", "conqueror", "treeEater", "colossus", "frugal", "allied", ...LEAGUES] as const;
export type TitleId = (typeof TITLE_IDS)[number];
/** Podium colours, then one colour per league above Bronze. */
export const COLOR_IDS = ["gold", "silver", "copper", "moss", "amber", "ice", "violet"] as const;
export type ColorId = (typeof COLOR_IDS)[number];
export const SKIN_IDS = ["morel", "coprinus", "clavaria", "amanita"] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export type RewardKind = "title" | "color" | "skin" | "strain";
export interface Reward {
  kind: RewardKind;
  id: string;
}

/** Title of each leaderboard's winner. */
const BOARD_TITLES: Record<SecondaryBoard, TitleId> = {
  territory: "colossus",
  conquests: "conqueror",
  boss: "treeEater",
  efficiency: "frugal",
};

/** League colours, Silver to Primordial. */
const LEAGUE_COLORS: Record<Exclude<LeagueId, "bronze">, ColorId> = { silver: "moss", gold: "amber", diamond: "ice", primordial: "violet" };
const PODIUM_COLORS: ColorId[] = ["gold", "silver", "copper"];

/** Carpophore skins and Moisissure unlock with the account's career (seasons played, fruitings, trophies). */
export const REWARDS = {
  skins: {
    morel: { fruitings: 5 },
    coprinus: { seasons: 3 },
    clavaria: { trophies: 25 },
    amanita: { seasons: 10 },
  } as Readonly<Record<SkinId, Partial<Career>>>,
  /** Moisissure (M7, DECIDED): after 3 seasons played. */
  moldSeasons: 3,
} as const;

/** Totals over every season an account played. */
export interface Career {
  seasons: number;
  fruitings: number;
  trophies: number;
}

export function isReward(kind: string, id: string): boolean {
  switch (kind) {
    case "title":
      return (TITLE_IDS as readonly string[]).includes(id);
    case "color":
      return (COLOR_IDS as readonly string[]).includes(id);
    case "skin":
      return (SKIN_IDS as readonly string[]).includes(id);
    case "strain":
      return (STRAIN_IDS as readonly string[]).includes(id);
    default:
      return false;
  }
}

/** Rewards earned by a career, whatever the season: skins and Moisissure. */
export function careerRewards(career: Career): Reward[] {
  const out: Reward[] = [];
  for (const id of SKIN_IDS) {
    const need = REWARDS.skins[id];
    if ((need.seasons ?? 0) <= career.seasons && (need.fruitings ?? 0) <= career.fruitings && (need.trophies ?? 0) <= career.trophies) {
      out.push({ kind: "skin", id });
    }
  }
  if (career.seasons >= REWARDS.moldSeasons) out.push({ kind: "strain", id: "mold" satisfies StrainId });
  return out;
}

/**
 * What a finished forest gives each colony (besides the career rewards): the winner's title of each
 * leaderboard, the champion's and podium colours, the title of the best alliance for its members, and
 * the title and colour of the league reached.
 */
export function seasonRewards(
  lines: readonly SeasonLine[],
  ranks: ReadonlyMap<string, number>,
  bestAlliance: readonly string[],
  leaguesAfter: ReadonlyMap<string, number>,
): Map<string, Reward[]> {
  const out = new Map<string, Reward[]>(lines.map((l) => [l.playerId, []]));
  const give = (id: string, r: Reward) => out.get(id)?.push(r);
  for (const l of lines) {
    const rank = ranks.get(l.playerId) ?? Infinity;
    if (rank === 1) give(l.playerId, { kind: "title", id: "champion" });
    if (rank <= PODIUM_COLORS.length) give(l.playerId, { kind: "color", id: PODIUM_COLORS[rank - 1]! });
    const league = leagueId(leaguesAfter.get(l.playerId) ?? 0);
    give(l.playerId, { kind: "title", id: league });
    if (league !== "bronze") give(l.playerId, { kind: "color", id: LEAGUE_COLORS[league] });
  }
  for (const board of SECONDARY_BOARDS) {
    const top = secondaryBoard(lines, board)[0];
    if (top) give(top.playerId, { kind: "title", id: BOARD_TITLES[board] });
  }
  for (const id of bestAlliance) give(id, { kind: "title", id: "allied" });
  return out;
}
