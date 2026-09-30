/**
 * Solo week simulation (roadmap M2): a simple bot plays a week with a given schedule, using the
 * real rules. Used by the CI test `sim.test.ts` and by `pnpm --filter @mycelium/shared simulate`.
 */
import {
  EXHAUSTION,
  MUTATION_BRANCHES,
  QUEUE_MAX,
  ROOTS,
  SPORE_UPGRADE_IDS,
  STARTER_STRAINS,
  STRUCTURES,
  UPGRADE_STATS,
  type SporeUpgradeId,
  type MutationBranch,
  type StrainId,
  type UpgradeId,
} from "../balance";
import {
  advance,
  biomassConversion,
  build,
  buySporeUpgrade,
  buyUpgrade,
  canColonizeTerrain,
  carpophores,
  checkBuild,
  checkColonize,
  checkMutate,
  chooseStrain,
  cloneGame,
  demolish,
  colonizationCost,
  fructify,
  fruitingPreview,
  colonize,
  conversionRate,
  goOffline,
  goOnline,
  heartReadyAt,
  humidity,
  moveHeart,
  mutate,
  networkHops,
  ownedCount,
  newGame,
  productionRate,
  richness,
  rootsFactor,
  sporeUpgradeCost,
  structureCost,
  terrainFactor,
  tileProduction,
  tileYield,
  upgradeCost,
  type GameState,
  type Tile,
} from "../game";
import { hexDistance, hexKey, hexNeighbors } from "../hex";
import { centreDistance, ringAt } from "../forestgen";

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

/** How a bot builds its colony: its strain, and the order in which it follows the mutation branches. */
export interface BotPlan {
  /** null: plays without a strain. */
  strain: StrainId | null;
  /** Empty: takes no mutation. */
  branches: readonly MutationBranch[];
  /** Fruits once, this many hours after joining, keeping the tiles within `radius` of the Cœur. */
  fruit?: { hour: number; radius: number };
  /**
   * Where the bot expands: "centre" pushes towards the rich, contested middle of the forest; "home"
   * stays in its own slice (rim and middle ring) and avoids tiles touching another player.
   */
  aim?: "centre" | "home";
}

/** No strain, no mutation: the economy alone (M1–M4 pacing). */
export const NEUTRAL_PLAN: BotPlan = { strain: null, branches: [] };

const BRANCHES = Object.keys(MUTATION_BRANCHES) as MutationBranch[];

/** A plan picked from the bot's id, so that robots differ but stay the same across restarts. */
export function defaultPlan(id: string): BotPlan {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const first = BRANCHES[h % 3]!;
  const second = BRANCHES[(h % 3 + 1 + ((h >>> 4) % 2)) % 3]!;
  // Half of the robots fruit once, between day 3 and day 5.
  const fruit = (h >>> 12) % 2 === 0 ? { hour: 60 + ((h >>> 13) % 48), radius: 3 } : undefined;
  return { strain: STARTER_STRAINS[(h >>> 8) % STARTER_STRAINS.length]!, branches: [first, second, ...BRANCHES.filter((b) => b !== first && b !== second)], fruit };
}

/**
 * One bot decision: pick the strain and mutations, plan the queue, buy upgrades that pay back faster
 * than tiles, move the Cœur. Also drives the server's test robots.
 */
export function botPlay(state: GameState, now: number, sessionStart: boolean, plan: BotPlan = defaultPlan(state.id)): void {
  if (plan.strain !== null && state.strain === null && ownedCount(state) <= 1) chooseStrain(state, plan.strain);
  if (plan.fruit && state.fruitings === 0 && now >= state.joinedAt + plan.fruit.hour * 3_600_000) fruit(state, plan.fruit.radius, now);
  spendSpores(state);
  takeMutations(state, plan, now);
  if (sessionStart && now >= heartReadyAt(state)) moveHeartToCentre(state, now);
  fillQueue(state, now, plan.aim);
  buyUpgrades(state);
  buildStructures(state, now);
}

/** Builds a Carpophore on the Cœur (or next to it) if needed, then fruits. */
function fruit(state: GameState, radius: number, now: number): void {
  if (carpophores(state) === 0) {
    const hops = networkHops(state);
    const spot = [...hops.keys()]
      .map((k) => state.tiles.get(k)!)
      .filter((t) => hexDistance(state.heart, t) <= 1)
      .sort((a, b) => hexDistance(state.heart, a) - hexDistance(state.heart, b))
      .find((t) => t.structure === null || t.structure === "node");
    if (!spot) return;
    if (spot.structure !== null) demolish(state, spot, now); // Replaces a Node.
    if (!build(state, spot, "carpophore", now).ok) return;
  }
  if (fruitingPreview(state, radius, now).lost.length > 0) fructify(state, radius, now);
}

/** Value of one Spore shop level, as a share of biomass gained. */
const SPORE_VALUE: Record<SporeUpgradeId, number> = { production: 0.1, conversion: 0.05, mutationPoint: 0.08, growth: 0.03 };

function spendSpores(state: GameState): void {
  for (;;) {
    let best: SporeUpgradeId | null = null;
    let bestRatio = 0;
    for (const id of SPORE_UPGRADE_IDS) {
      const cost = sporeUpgradeCost(id, state.sporeUpgrades[id]);
      if (cost > state.spores) continue;
      const ratio = SPORE_VALUE[id] / cost;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = id;
      }
    }
    if (!best || !buySporeUpgrade(state, best).ok) return;
  }
}

/**
 * Builds Digestion nodes (and Reservoirs) when they pay back faster than the next tile. Robots leave
 * Glands, Rhizomorphs and Sclerotia alone.
 */
function buildStructures(state: GameState, now: number): void {
  for (let guard = 0; guard < 5; guard++) {
    const nextTile = state.queue[0] ? state.tiles.get(hexKey(state.queue[0])) : undefined;
    const tileRoi = nextTile ? tileValue(state, nextTile) : 0;
    const conv = biomassConversion(state);
    const hops = networkHops(state);
    let best: { tile: Tile; id: "node" | "reservoir"; roi: number } | null = null;
    for (const k of hops.keys()) {
      const tile = state.tiles.get(k)!;
      if (tile.structure !== null || tile.terrain === "rock") continue;
      const prod = tileProduction(state, tile, hops, now);
      const node = (prod * STRUCTURES.nodeBonus * conv) / structureCost(state, "node");
      if (!best || node > best.roi) best = { tile, id: "node", roi: node };
      let dry = 0;
      for (const n of hexNeighbors(tile)) {
        const t = state.tiles.get(hexKey(n));
        if (t && t.owner === state.id && humidity(state, t) === 1) dry += tileProduction(state, t, hops, now);
      }
      const reservoir = (dry * 0.25 * conv) / structureCost(state, "reservoir");
      if (reservoir > best.roi) best = { tile, id: "reservoir", roi: reservoir };
    }
    if (!best || best.roi <= tileRoi || !checkBuild(state, best.tile, best.id).ok) return;
    build(state, best.tile, best.id, now);
  }
}

/** Spends mutation points down the plan's branches, in order. */
function takeMutations(state: GameState, plan: BotPlan, now: number): void {
  for (const branch of plan.branches) {
    for (const id of MUTATION_BRANCHES[branch]) {
      if (state.mutations.includes(id)) continue;
      if (!checkMutate(state, id).ok) return;
      mutate(state, id, now);
    }
  }
}

/**
 * Expected biomass per second per nutrient spent on a wild tile; `production` (the current total)
 * values the network bonus of Roots.
 */
function tileValue(state: GameState, tile: Tile, production = 0): number {
  let perSecond =
    tileYield(tile.terrain, state.upgrades) * terrainFactor(state, tile.terrain) * richness(state, tile) * humidity(state, tile) * (1 - EXHAUSTION.max * 0.75); // ~average wear
  if (tile.terrain === "roots") perSecond += production * ROOTS.networkBonus * rootsFactor(state);
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
      if (t && t.owner === null && canColonizeTerrain(state, t.terrain)) out.push(t);
    }
  }
  return out;
}

/** Multiplier on a tile's value from the bot's aim (1 without aim, 0 = never). */
function aimFactor(state: GameState, tile: Tile, aim: BotPlan["aim"]): number {
  if (!aim || state.layout.kind !== "forest") return 1;
  const rho = centreDistance(tile) / state.radius;
  if (aim === "centre") return 1 + 4 * Math.max(0, 1 - rho) ** 2;
  if (ringAt(state.radius, tile) === "centre") return 0;
  const enemy = hexNeighbors(tile).some((n) => {
    const t = state.tiles.get(hexKey(n));
    return t !== undefined && t.owner !== null && t.owner !== state.id;
  });
  return (enemy ? 0.2 : 1) * (ringAt(state.radius, tile) === "middle" ? 0.6 : 1);
}

function fillQueue(state: GameState, now: number, aim?: BotPlan["aim"]): void {
  const production = productionRate(state);
  while (state.queue.length < QUEUE_MAX) {
    let best: Tile | null = null;
    let bestValue = -Infinity;
    for (const tile of candidates(state)) {
      if (!checkColonize(state, tile).ok) continue;
      const v = tileValue(state, tile, production) * aimFactor(state, tile, aim);
      if (v > bestValue && v > 0) {
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
