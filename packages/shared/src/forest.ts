import { BORDERS, FOREST, MUTATIONS, ROCK, STRUCTURES, VISION_RADIUS } from "./balance";
import { generateForestMap, type MapLayout } from "./forestgen";
import {
  advance,
  capturedFactor,
  conquestFactor,
  biomassConversion,
  emptySporeUpgrades,
  hasMutation,
  pressureFactor,
  emptyUpgrades,
  networkHops,
  newPlayer,
  refreshConnections,
  richness,
  tileYield,
  wildTile,
  humidity,
  type GameState,
  type Tile,
} from "./game";
import { hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors, type Hex } from "./hex";
import { fromSnapshot, toSnapshot, type GameSnapshot, type TileDto } from "./protocol";
import { phaseAt } from "./season";

/**
 * A forest (GDD §2.1): one shared map, 20 to 30 players. Each player's economy runs with the rules
 * of game.ts on the shared tiles; this file adds what involves several players: joining, wild
 * border pressure and captures (GDD §6.1), and what each player can see.
 */
export interface ForestState {
  readonly seed: number;
  readonly radius: number;
  readonly layout: Extract<MapLayout, { kind: "forest" }>;
  /** Spawn of each slice (GDD §2.5), in slice order. */
  readonly spawns: readonly Hex[];
  readonly tiles: Map<string, Tile>;
  readonly players: Map<string, GameState>;
  /** Follows the weekly calendar (GDD §7). */
  readonly calendar: boolean;
  updatedAt: number;
}

export interface CaptureEvent {
  q: number;
  r: number;
  from: string;
  to: string;
}

export function newForest(
  seed: number,
  now: number,
  capacity: number = FOREST.capacity,
  options: { calendar?: boolean } = {},
): ForestState {
  const map = generateForestMap(seed, capacity);
  const tiles = new Map<string, Tile>();
  for (const t of map.tiles) tiles.set(hexKey(t), wildTile(t, t.terrain));
  const forest: ForestState = {
    seed,
    radius: map.radius,
    layout: { kind: "forest", capacity },
    spawns: map.spawns,
    tiles,
    players: new Map(),
    calendar: options.calendar ?? true,
    updatedAt: now,
  };
  refreshReservations(forest, now);
  return forest;
}

/** Slices whose spawn is not taken yet. */
export function freeSlices(forest: ForestState): number[] {
  const taken = new Set([...forest.players.values()].map((p) => hexKey(p.spawn)));
  return forest.spawns.map((s, i) => [s, i] as const).filter(([s]) => !taken.has(hexKey(s)) && forest.tiles.get(hexKey(s))?.owner === null).map(([, i]) => i);
}

/**
 * Adds a player to a free slice, as far as possible from the slices already taken, so that a
 * forest that is still filling up does not pile everyone in one corner.
 */
export function joinForest(forest: ForestState, id: string, now: number): GameState | null {
  const free = freeSlices(forest);
  if (free.length === 0) return null;
  const capacity = forest.layout.capacity;
  const taken = forest.spawns.map((_, i) => i).filter((i) => !free.includes(i));
  const gap = (i: number) =>
    taken.length === 0 ? 0 : Math.min(...taken.map((j) => Math.min(Math.abs(i - j), capacity - Math.abs(i - j))));
  const slice = free.reduce((best, i) => (gap(i) > gap(best) ? i : best), free[0]!);
  advanceForest(forest, now);
  const player = newPlayer(id, forest, forest.spawns[slice]!, now);
  player.lastSeenAt = now;
  forest.players.set(id, player);
  refreshReservations(forest, now);
  refreshToxins(forest);
  return player;
}

/**
 * Start zones (GDD §6.4): tiles near the spawn of a slice nobody has joined yet are kept for the
 * future player, and tiles near a new player's spawn are theirs alone for 24 h, so that nobody
 * arrives already surrounded.
 */
export function refreshReservations(forest: ForestState, now: number): void {
  for (const t of forest.tiles.values()) t.reservedFor = null;
  const bySpawn = new Map([...forest.players.values()].map((p) => [hexKey(p.spawn), p]));
  forest.spawns.forEach((spawn, i) => {
    const p = bySpawn.get(hexKey(spawn));
    const key = p ? (now - p.joinedAt < BORDERS.protectedMs ? p.id : null) : `slice:${i}`;
    if (key === null) return;
    for (const h of hexesInRadius(spawn, BORDERS.protectedRadius)) {
      const t = forest.tiles.get(hexKey(h));
      if (t) t.reservedFor = key;
    }
  });
}

/** Runs every player's economy up to `to`. */
export function advanceForest(forest: ForestState, to: number): void {
  const dt = to - forest.updatedAt;
  if (dt <= 0) return;
  refreshReservations(forest, forest.updatedAt);
  refreshToxins(forest);
  for (const p of forest.players.values()) advance(p, to);
  forest.updatedAt = to;
  refreshReservations(forest, to);
  refreshToxins(forest);
}

/**
 * Toxines (GDD §4.2): a player's tiles touching a colonised tile of a player with that mutation
 * produce less. Refreshed whenever the forest moves on (the effect follows the borders tick by tick).
 */
export function refreshToxins(forest: ForestState): void {
  const toxic = new Set([...forest.players.values()].filter((p) => hasMutation(p, "toxins")).map((p) => p.id));
  for (const t of forest.tiles.values()) {
    t.toxic =
      toxic.size > 0 &&
      t.owner !== null &&
      hexNeighbors(t).some((n) => {
        const o = forest.tiles.get(hexKey(n));
        return o !== undefined && o.owner !== null && o.owner !== t.owner && o.growthEndsAt === null && toxic.has(o.owner);
      });
  }
}

/** A tile that cannot be taken right now: a Cœur, a Sclérote, or the start zone of a new player (GDD §4.1, §6.4). */
export function isProtected(forest: ForestState, tile: Tile, now: number): boolean {
  const owner = tile.owner === null ? undefined : forest.players.get(tile.owner);
  if (!owner) return false;
  if (hexEquals(owner.heart, tile)) return true;
  if (tile.structure === "sclerotium" && tile.growthEndsAt === null) return true;
  return now - owner.joinedAt < BORDERS.protectedMs && hexDistance(owner.spawn, tile) <= BORDERS.protectedRadius;
}

/** `pression = densité_réseau_local × agression × humidité` (GDD §6.1) of one player around a tile. */
export function pressure(forest: ForestState, playerId: string, around: Hex, connected?: Map<string, number>): number {
  const player = forest.players.get(playerId);
  if (!player) return 0;
  let total = 0;
  for (const h of hexesInRadius(around, BORDERS.densityRadius)) {
    const t = forest.tiles.get(hexKey(h));
    if (!t || t.owner !== playerId || t.growthEndsAt !== null) continue;
    if (connected && !connected.has(hexKey(h))) continue;
    total += humidity(player, t);
  }
  return total * pressureFactor(player);
}

/**
 * Defensive multiplier on the capture speed of a tile: a Rhizomorphe on it, or a Rock of the same owner
 * next to it (GDD §2.2 "rempart"), slow the attacker down; both together multiply.
 */
export function defenceFactor(forest: ForestState, tile: Tile): number {
  let f = tile.structure === "rhizomorph" ? STRUCTURES.rhizomorphCaptureFactor : 1;
  const rampart = hexNeighbors(tile).some((n) => {
    const t = forest.tiles.get(hexKey(n));
    return t !== undefined && t.terrain === "rock" && t.owner === tile.owner && t.growthEndsAt === null;
  });
  if (rampart) f *= ROCK.rampartFactor;
  return f;
}

/** Capture speed from the two pressures: 0 up to parity, full speed from `fullSpeedRatio`. */
export function captureSpeed(attack: number, defence: number): number {
  if (attack <= 0) return 0;
  if (defence <= 0) return 1;
  return Math.min(1, Math.max(0, (attack / defence - 1) / (BORDERS.fullSpeedRatio - 1)));
}

/**
 * Border fights over `dt` ms ending at `now` (GDD §6.1): every tile touched by another player's
 * connected network is pushed by the strongest neighbour; the capture completes after the
 * terrain's capture time at full speed, and falls back when the pressure drops.
 */
export function resolveBorders(forest: ForestState, dt: number, now: number): CaptureEvent[] {
  // GDD §7: no PvP on Monday, nothing moves once the season is frozen; other days speed it up or down.
  const phaseSpeed = forest.calendar ? phaseAt(now).effects.captureSpeed : 1;
  if (phaseSpeed === 0) return [];
  const connected = new Map<string, Map<string, number>>();
  for (const p of forest.players.values()) connected.set(p.id, networkHops(p));
  const events: CaptureEvent[] = [];

  for (const tile of forest.tiles.values()) {
    if (tile.owner === null) continue;
    const defender = forest.players.get(tile.owner);
    if (!defender) continue;

    let best: { id: string; speed: number; attack: number } | null = null;
    if (!isProtected(forest, tile, now)) {
      const attackers = new Set<string>();
      for (const n of hexNeighbors(tile)) {
        const o = forest.tiles.get(hexKey(n))?.owner;
        if (o && o !== tile.owner && connected.get(o)?.has(hexKey(n))) attackers.add(o);
      }
      if (attackers.size > 0) {
        const defence = pressure(forest, defender.id, tile);
        for (const a of attackers) {
          const attack = pressure(forest, a, tile, connected.get(a));
          const speed = captureSpeed(attack, defence);
          if (speed > 0 && (!best || speed > best.speed || (speed === best.speed && attack > best.attack))) best = { id: a, speed, attack };
        }
      }
    }

    const duration = BORDERS.captureMs[tile.terrain];
    if (!best) {
      if (tile.capture) {
        tile.capture.progress -= dt / duration;
        if (tile.capture.progress <= 0) tile.capture = null;
      }
      continue;
    }
    if (!tile.capture || tile.capture.by !== best.id) tile.capture = { by: best.id, progress: 0 };
    const shielded = defender.lastSeenAt !== null && now - defender.lastSeenAt >= BORDERS.shieldAfterMs;
    tile.capture.progress +=
      (dt / duration) * best.speed * phaseSpeed * (shielded ? BORDERS.shieldFactor : 1) * defenceFactor(forest, tile) * capturedFactor(defender);
    if (tile.capture.progress >= 1 - 1e-9) {
      const attacker = forest.players.get(best.id)!;
      events.push({ q: tile.q, r: tile.r, from: defender.id, to: attacker.id });
      conquer(attacker, tile);
    }
  }

  if (events.length > 0) {
    for (const p of forest.players.values()) refreshConnections(p, now);
    refreshToxins(forest);
  }
  return events;
}

/** The attacker takes the tile, with the conquest bonus and a Trophy (GDD §2.5). */
function conquer(attacker: GameState, tile: Tile): void {
  tile.owner = attacker.id;
  tile.growthEndsAt = null;
  tile.growthStartedAt = null;
  tile.disconnectedSince = null;
  tile.capture = null;
  // Structures are destroyed, unless the attacker has Cordyceps (a second Sclérote is not kept).
  const keep =
    hasMutation(attacker, "cordyceps") &&
    !(tile.structure === "sclerotium" && [...attacker.tiles.values()].some((t) => t !== tile && t.owner === attacker.id && t.structure === "sclerotium"));
  if (!keep) tile.structure = null;
  attacker.trophies += 1;
  const perSecond = tileYield(tile.terrain, attacker.upgrades) * richness(attacker, tile);
  attacker.biomass += ((perSecond * BORDERS.conquestBonusMs) / 1000) * biomassConversion(attacker) * conquestFactor(attacker);
}

/**
 * Tiles a player can see (GDD §2.1 fog): their own, those within VISION_RADIUS of them, farther around
 * their Carpophores, and every Carpophore of the forest (GDD §4.1: "visible par tous").
 */
export function visibleKeys(forest: ForestState, playerId: string): Set<string> {
  const seen = new Set<string>();
  const viewer = forest.players.get(playerId);
  const glowing = viewer !== undefined && hasMutation(viewer, "bioluminescence");
  /** Truffe (GDD §4.3): a truffle's tiles are only seen by the players whose tiles touch them. */
  const hidden = (t: Tile) => {
    if (t.owner === null || t.owner === playerId || forest.players.get(t.owner)?.strain !== "truffle") return false;
    return !hexNeighbors(t).some((n) => forest.tiles.get(hexKey(n))?.owner === playerId);
  };
  for (const [key, t] of forest.tiles) {
    if (t.structure === "carpophore" && t.owner !== null && forest.players.get(t.owner)?.strain !== "truffle") seen.add(key);
    if (t.owner !== playerId) continue;
    const vision = t.structure === "carpophore" && t.growthEndsAt === null ? STRUCTURES.carpophoreVision : VISION_RADIUS;
    for (const h of hexesInRadius(t, vision)) {
      const k = hexKey(h);
      const o = forest.tiles.get(k);
      if (o && !hidden(o)) seen.add(k);
    }
    if (glowing) {
      // Bioluminescence (GDD §4.2): enemy networks within 3 tiles.
      for (const h of hexesInRadius(t, MUTATIONS.bioluminescenceVision)) {
        const k = hexKey(h);
        const o = forest.tiles.get(k);
        if (o && o.owner !== null && o.owner !== playerId && !hidden(o)) seen.add(k);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Serialisation (memory store, tests)

export interface ForestDto {
  seed: number;
  radius: number;
  capacity: number;
  spawns: Hex[];
  calendar: boolean;
  updatedAt: number;
  tiles: TileDto[];
  players: GameSnapshot[];
}

export function serializeForest(forest: ForestState): ForestDto {
  const everything = undefined;
  const none = new Set<string>();
  const tiles = toSnapshot([...forest.players.values()][0] ?? placeholder(forest), everything).tiles;
  return {
    seed: forest.seed,
    radius: forest.radius,
    capacity: forest.layout.capacity,
    spawns: forest.spawns.map((h) => ({ q: h.q, r: h.r })),
    calendar: forest.calendar,
    updatedAt: forest.updatedAt,
    tiles,
    players: [...forest.players.values()].map((p) => toSnapshot(p, none)),
  };
}

export function deserializeForest(dto: ForestDto): ForestState {
  const tiles = fromSnapshot(
    { ...(dto.players[0] ?? emptySnapshot(dto)), tiles: dto.tiles },
    dto.seed,
  ).tiles;
  const players = new Map<string, GameState>();
  for (const p of dto.players) players.set(p.id, { ...fromSnapshot(p, dto.seed), tiles });
  const forest: ForestState = {
    seed: dto.seed,
    radius: dto.radius,
    layout: { kind: "forest", capacity: dto.capacity },
    spawns: dto.spawns.map((h) => ({ q: h.q, r: h.r })),
    tiles,
    players,
    calendar: dto.calendar ?? true,
    updatedAt: dto.updatedAt,
  };
  refreshReservations(forest, forest.updatedAt);
  refreshToxins(forest);
  return forest;
}

/** A player-shaped view of an empty forest, to serialise its tiles. */
function placeholder(forest: ForestState): GameState {
  return { ...newPlayer("", { ...forest, tiles: new Map() }, forest.spawns[0]!, forest.updatedAt), tiles: forest.tiles };
}

function emptySnapshot(dto: ForestDto): GameSnapshot {
  return {
    id: "",
    radius: dto.radius,
    layout: { kind: "forest", capacity: dto.capacity },
    spawn: dto.spawns[0]!,
    joinedAt: dto.updatedAt,
    trophies: 0,
    calendar: dto.calendar ?? true,
    mondayBonus: 0,
    strain: null,
    mutations: [],
    spores: 0,
    sporeUpgrades: emptySporeUpgrades(),
    fruitings: 0,
    automation: { colonize: null, upgrades: false },
    heart: dto.spawns[0]!,
    heartMovedAt: null,
    tiles: [],
    queue: [],
    nutrients: 0,
    enzymes: 0,
    enzymesUnlocked: false,
    biomass: 0,
    upgrades: emptyUpgrades(),
    lastSeenAt: null,
    updatedAt: dto.updatedAt,
  };
}
