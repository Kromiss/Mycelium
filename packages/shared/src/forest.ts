import { ACTION_EFFECTS, ANTI_FRUSTRATION, BORDERS, CENTRE_RISK, COHESION, ENRICH, FOREST, MUTATIONS, ROCK, STRUCTURES, VISION_RADIUS, FOG_ENABLED, ZONES } from "./balance";
import { generateForestMap, ringAt, zoneAt, zoneValue, type MapLayout } from "./forestgen";
import {
  activeEffect,
  advance,
  effectsAt,
  capturedFactor,
  captureSpeedFactor,
  pressureTakenFactor,
  cohesion,
  conquestFactor,
  refreshBuds,
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
import { asTileOf, borderTilesOf, diskVersion, mapOrder, neighbourTiles, ownedTilesOf, ownerCounts, tileKey, tilesWithin, topologyEpoch } from "./tile-index";
import { fromSnapshot, toSnapshot, type GameSnapshot, type TileDto } from "./protocol";
import { phaseAt } from "./season";
import type { ForestEvent } from "./events";
import { isAllied, pruneListens, refreshPacts, settlePacts, type Pact, type PactInvite } from "./social";

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
  /** The season's random events and world bosses (GDD §7, M6), drawn when first needed. */
  events: ForestEvent[];
  /** Pactes de symbiose (M7), ended ones included (they still count in the alliance leaderboard). */
  pacts: Pact[];
  /** Pact invitations waiting for an answer (M7). */
  invites: PactInvite[];
  updatedAt: number;
}

export interface CaptureEvent {
  q: number;
  r: number;
  from: string;
  to: string;
  /** The tile was the loser's Cœur. */
  heart?: true;
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
    events: [],
    pacts: [],
    invites: [],
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
  const bySpawn = new Map([...forest.players.values()].map((p) => [hexKey(p.spawn), p]));
  const keys = forest.spawns.map((spawn, i) => {
    const p = bySpawn.get(hexKey(spawn));
    return p ? (now - p.joinedAt < BORDERS.protectedMs ? p.id : null) : `slice:${i}`;
  });
  // M9 speed-up: the zones only change when a player joins or a protection ends.
  const signature = keys.join("|");
  if (reservationState.get(forest) === signature) return;
  for (const t of forest.tiles.values()) t.reservedFor = null;
  forest.spawns.forEach((spawn, i) => {
    const key = keys[i]!;
    if (key === null) return;
    for (const h of hexesInRadius(spawn, BORDERS.protectedRadius)) {
      const t = forest.tiles.get(hexKey(h));
      if (t) t.reservedFor = key;
    }
  });
  reservationState.set(forest, signature);
}

/** The zones last written on each forest's tiles. */
const reservationState = new WeakMap<ForestState, string>();

/** Runs every player's economy up to `to`. */
export function advanceForest(forest: ForestState, to: number): void {
  const dt = to - forest.updatedAt;
  if (dt <= 0) return;
  refreshReservations(forest, forest.updatedAt);
  refreshPacts(forest);
  refreshToxins(forest);
  for (const p of forest.players.values()) {
    advance(p, to);
    refreshBuds(p, to);
  }
  forest.updatedAt = to;
  settleSiphons(forest, to);
  settlePacts(forest, to);
  pruneEffects(forest, to);
  pruneListens(forest, to);
  refreshReservations(forest, to);
  refreshToxins(forest);
}

/**
 * Hands siphoned nutrients to their casters (GDD §6.2 Siphon): nutrients, and the biomass they would
 * have given the caster at `at`.
 */
export function settleSiphons(forest: ForestState, at: number): void {
  for (const p of forest.players.values()) {
    for (const [by, amount] of Object.entries(p.siphoned)) {
      const caster = forest.players.get(by);
      if (caster && amount > 0) {
        caster.nutrients += amount;
        caster.biomass += amount * biomassConversion(caster) * effectsAt(caster, at).biomass;
      }
    }
    p.siphoned = {};
  }
}

/** Drops the tile effects that are over. */
export function pruneEffects(forest: ForestState, at: number): void {
  for (const t of forest.tiles.values()) {
    if (t.effects.length > 0 && t.effects.some((e) => e.until <= at)) t.effects = t.effects.filter((e) => e.until > at);
  }
}

/** Tiles owned by each player, growing ones included. */
export function tileCounts(forest: ForestState): Map<string, number> {
  return ownerCounts(forest.tiles);
}

/** GDD §6.4: `attacker` is at least 3× bigger than `defender` (in tiles), so attacking them costs more. */
export function isBullying(counts: Map<string, number>, attacker: string, defender: string): boolean {
  return (counts.get(attacker) ?? 0) >= ANTI_FRUSTRATION.bullyRatio * Math.max(1, counts.get(defender) ?? 0);
}

/** M6 floor: a player down to this many tiles cannot lose any more. */
export function atFloor(counts: Map<string, number>, playerId: string): boolean {
  return (counts.get(playerId) ?? 0) <= ANTI_FRUSTRATION.floorTiles;
}

/** The tile lies in the forest centre (GDD §2.5 war zone). */
export function inCentre(forest: ForestState, h: Hex): boolean {
  return ringAt(forest.radius, h) === "centre";
}

/**
 * Toxines (GDD §4.2): a player's tiles touching a colonised tile of a player with that mutation
 * produce less (not between allies, M7). Refreshed whenever the forest moves on (the effect follows
 * the borders tick by tick).
 */
export function refreshToxins(forest: ForestState): void {
  const toxic = new Set([...forest.players.values()].filter((p) => hasMutation(p, "toxins")).map((p) => p.id));
  // M9 speed-up: nothing to do when nobody is toxic and no tile is marked, or when neither the tiles, the
  // toxic players nor the pacts changed since the last time.
  const state = toxinState.get(forest);
  if (toxic.size === 0 && state !== undefined && !state.marked) return;
  const epoch = topologyEpoch(forest.tiles);
  const signature = `${[...toxic].join(",")}/${[...forest.players.values()].map((p) => `${p.id}:${p.pact}`).join(",")}`;
  if (epoch !== null && state !== undefined && state.epoch === epoch && state.signature === signature) return;
  let marked = false;
  for (const t of forest.tiles.values()) {
    const owner = t.owner;
    const v =
      toxic.size > 0 &&
      owner !== null &&
      neighbourTiles(forest.tiles, t).some((o) => o.owner !== null && o.owner !== owner && o.growthEndsAt === null && toxic.has(o.owner) && !isAllied(forest, o.owner, owner));
    t.toxic = v;
    if (v) marked = true;
  }
  toxinState.set(forest, { marked, epoch, signature });
}

const toxinState = new WeakMap<ForestState, { marked: boolean; epoch: number | null; signature: string }>();

/**
 * A tile that cannot be taken right now: a Cœur lost less than a day ago, a Sclérote, or the start zone
 * of a new player (GDD §4.1, §6.4). The floor of tiles is checked by `resolveBorders`.
 */
export function isProtected(forest: ForestState, tile: Tile, now: number): boolean {
  const owner = tile.owner === null ? undefined : forest.players.get(tile.owner);
  if (!owner) return false;
  if (hexEquals(owner.heart, tile) && owner.heartShieldUntil !== null && now < owner.heartShieldUntil) return true;
  if (tile.structure === "sclerotium" && tile.growthEndsAt === null) return true;
  return isStartZone(owner, tile, now);
}

/** The start zone of a player who joined less than 24 h ago (GDD §6.4). */
export function isStartZone(owner: GameState, h: Hex, now: number): boolean {
  return now - owner.joinedAt < BORDERS.protectedMs && hexDistance(owner.spawn, h) <= BORDERS.protectedRadius;
}

/** `pression = densité_réseau_local × agression × humidité` (GDD §6.1) of one player around a tile. */
export function pressure(forest: ForestState, playerId: string, around: Hex, connected?: Map<string, number>): number {
  const player = forest.players.get(playerId);
  if (!player) return 0;
  let total = 0;
  const centre = asTileOf(forest.tiles, around) ?? forest.tiles.get(hexKey(around));
  const disk = centre !== undefined ? tilesWithin(forest.tiles, centre, BORDERS.densityRadius) : null;
  if (disk && centre) {
    // The density only changes with the tiles around (and their neighbours, for humidity) and with the
    // network the player pushes with (M9 speed-up).
    const version = diskVersion(forest.tiles, centre, BORDERS.densityRadius);
    const byPlayer = densities.get(centre);
    const known = byPlayer?.get(playerId);
    if (version !== null && known !== undefined && known.version === version && known.connected === (connected ?? null) && known.player === player) {
      return known.density * pressureFactor(player);
    }
    for (const t of disk) {
      if (t.owner !== playerId || t.growthEndsAt !== null) continue;
      if (connected && !connected.has(tileKey(forest.tiles, t))) continue;
      total += humidity(player, t);
    }
    if (version !== null) {
      const map = byPlayer ?? new Map();
      map.set(playerId, { version, connected: connected ?? null, player, density: total });
      if (!byPlayer) densities.set(centre, map);
    }
    return total * pressureFactor(player);
  }
  for (const h of hexesInRadius(around, BORDERS.densityRadius)) {
    const t = forest.tiles.get(hexKey(h));
    if (!t || t.owner !== playerId || t.growthEndsAt !== null) continue;
    if (connected && !connected.has(hexKey(h))) continue;
    total += humidity(player, t);
  }
  return total * pressureFactor(player);
}

/** `densité_réseau_local` around a tile, by player, and what it was computed from. */
const densities = new WeakMap<Tile, Map<string, { version: number; connected: Map<string, number> | null; player: GameState; density: number }>>();

/**
 * Defensive multiplier on the capture speed of a tile: a Rhizomorphe on it, or a Rock of the same owner
 * next to it (GDD §2.2 "rempart"), slow the attacker down; both together multiply.
 */
export function defenceFactor(forest: ForestState, tile: Tile): number {
  let f = tile.structure === "rhizomorph" ? STRUCTURES.rhizomorphCaptureFactor : 1;
  const rampart = neighbourTiles(forest.tiles, tile).some((t) => t.terrain === "rock" && t.owner === tile.owner && t.growthEndsAt === null);
  if (rampart) f *= ROCK.rampartFactor;
  return f;
}

/**
 * M8 Cohésion in defence: each neighbour of the defender's colony weakens the attacker's pressure by 8 %
 * (`pushBack`, a multiplier on the attack) and makes the capture 15 % longer (`hold`, a divisor of its speed).
 */
export function cohesionDefence(forest: ForestState, tile: Tile): { neighbours: number; pushBack: number; hold: number } {
  const n = cohesion(forest.tiles, tile);
  return { neighbours: n, pushBack: Math.max(0, 1 - COHESION.pressure * n), hold: 1 + COHESION.captureTime * n };
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
  for (const p of forest.players.values()) connected.set(p.id, networkHops(p, now));
  const counts = tileCounts(forest);
  const events: CaptureEvent[] = [];

  for (const tile of borderScan(forest)) {
    if (tile.owner === null) continue;
    const defender = forest.players.get(tile.owner);
    if (!defender) continue;

    let best: { id: string; speed: number; attack: number } | null = null;
    if (!isProtected(forest, tile, now) && !atFloor(counts, defender.id)) {
      const attackers = new Set<string>();
      for (const n of neighbourTiles(forest.tiles, tile)) {
        const o = n.owner;
        // M7: allies never push on each other.
        if (o && o !== tile.owner && connected.get(o)?.has(tileKey(forest.tiles, n)) && !isAllied(forest, o, tile.owner)) attackers.add(o);
      }
      if (attackers.size > 0) {
        const defence = pressure(forest, defender.id, tile);
        // Cohésion (M8) and Armillaire (M9: −15 %) weaken the attack.
        const pushBack = cohesionDefence(forest, tile).pushBack * pressureTakenFactor(defender);
        for (const a of attackers) {
          const attack = pressure(forest, a, tile, connected.get(a)) * pushBack;
          // Assaut (GDD §6.2): full speed as soon as the attacker is above parity, ×4.
          const assault = tile.effects.length > 0 && tile.effects.some((e) => e.kind === "assault" && e.by === a && e.until > now);
          let speed = assault ? (attack > defence ? ACTION_EFFECTS.assaultSpeed : 0) : captureSpeed(attack, defence);
          if (isBullying(counts, a, defender.id)) speed *= ANTI_FRUSTRATION.bullyCaptureFactor;
          // Cordyceps (M9): its captures run 15 % faster.
          const attackerState = forest.players.get(a);
          if (attackerState) speed *= captureSpeedFactor(attackerState);
          if (speed > 0 && (!best || speed > best.speed || (speed === best.speed && attack > best.attack))) best = { id: a, speed, attack };
        }
      }
    }

    // M9: the closer to the forest centre, the longer a capture takes (7 zones).
    const duration = BORDERS.captureMs[tile.terrain] * zoneValue(ZONES.capture, zoneAt(forest.layout, forest.radius, tile));
    if (!best) {
      if (tile.capture) {
        tile.capture.progress -= dt / duration;
        if (tile.capture.progress <= 0) tile.capture = null;
      }
      continue;
    }
    if (!tile.capture || tile.capture.by !== best.id) tile.capture = { by: best.id, progress: 0 };
    capturing(forest).add(tile);
    const shielded = defender.lastSeenAt !== null && now - defender.lastSeenAt >= BORDERS.shieldAfterMs;
    // GDD §2.5: the offline shield is weaker in the centre.
    const shield = shielded ? (inCentre(forest, tile) ? CENTRE_RISK.shieldFactor : BORDERS.shieldFactor) : 1;
    const isHeart = hexEquals(defender.heart, tile);
    const { hold: held } = cohesionDefence(forest, tile);
    tile.capture.progress +=
      (dt / duration / held) *
      best.speed *
      phaseSpeed *
      shield *
      defenceFactor(forest, tile) *
      capturedFactor(defender) *
      (isHeart ? ANTI_FRUSTRATION.heartCaptureFactor : 1);
    if (tile.capture.progress >= 1 - 1e-9) {
      const attacker = forest.players.get(best.id)!;
      events.push({ q: tile.q, r: tile.r, from: defender.id, to: attacker.id, ...(isHeart ? { heart: true } : {}) });
      conquer(attacker, tile);
      counts.set(defender.id, (counts.get(defender.id) ?? 1) - 1);
      counts.set(attacker.id, (counts.get(attacker.id) ?? 0) + 1);
      if (isHeart) rebirthHeart(forest, defender, tile, now);
    }
  }

  if (events.length > 0) {
    for (const p of forest.players.values()) refreshConnections(p, now);
    refreshToxins(forest);
  }
  return events;
}

/** Tiles where a capture may be under way (M9 speed-up), found by a full scan the first time. */
const captureTiles = new WeakMap<ForestState, Set<Tile>>();

function capturing(forest: ForestState): Set<Tile> {
  let set = captureTiles.get(forest);
  if (!set) {
    set = new Set();
    for (const t of forest.tiles.values()) if (t.capture) set.add(t);
    captureTiles.set(forest, set);
  }
  return set;
}

/**
 * The tiles `resolveBorders` must look at, in map order: every tile touching another owner, and every tile
 * with a capture under way (it falls back). The others have nothing to do. The whole map when not indexed.
 */
function borderScan(forest: ForestState): Iterable<Tile> {
  const border = borderTilesOf(forest.tiles);
  if (border === null) return forest.tiles.values();
  const set = capturing(forest);
  for (const t of set) if (!t.capture) set.delete(t);
  if (set.size === 0) return border;
  const all = new Set<Tile>(border);
  for (const t of set) all.add(t);
  return [...all].sort((a, b) => mapOrder(a) - mapOrder(b));
}

/**
 * The Cœur was taken (GDD §6.4): it is reborn on the player's Sclérote, or else on their tile closest to
 * where it was, and cannot be taken again for a day.
 */
export function rebirthHeart(forest: ForestState, player: GameState, lost: Hex, now: number): void {
  let best: Tile | null = null;
  let bestKey: [number, number, string] | null = null;
  for (const t of ownedTilesOf(forest.tiles, player.id)) {
    if (t.growthEndsAt !== null) continue;
    const k = tileKey(forest.tiles, t);
    const key: [number, number, string] = [t.structure === "sclerotium" ? 0 : 1, hexDistance(t, lost), k];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = t;
      bestKey = key;
    }
  }
  if (best) player.heart = { q: best.q, r: best.r };
  player.heartShieldUntil = now + ANTI_FRUSTRATION.heartShieldMs;
  refreshConnections(player, now);
}

/** The attacker takes the tile, with the conquest bonus and a Trophy (GDD §2.5). */
function conquer(attacker: GameState, tile: Tile): void {
  tile.owner = attacker.id;
  tile.growthEndsAt = null;
  tile.growthStartedAt = null;
  tile.disconnectedSince = null;
  tile.capture = null;
  tile.effects = [];
  // Structures are destroyed, unless the attacker has Parasitisme (a second Sclérote is not kept).
  const keep =
    hasMutation(attacker, "parasitism") &&
    !(tile.structure === "sclerotium" && ownedTilesOf(attacker.tiles, attacker.id).some((t) => t !== tile && t.structure === "sclerotium"));
  if (!keep) tile.structure = null;
  // M8: the tile keeps half of its enrichment levels.
  tile.level = Math.floor(tile.level * ENRICH.capturedKeep);
  attacker.trophies += 1;
  attacker.conquests += 1;
  const perSecond = tileYield(tile.terrain, attacker.upgrades) * richness(attacker, tile);
  attacker.biomass += ((perSecond * BORDERS.conquestBonusMs) / 1000) * biomassConversion(attacker) * conquestFactor(attacker);
}

/**
 * Tiles a player can see (GDD §2.1 fog): their own, those within VISION_RADIUS of them, farther around
 * their Carpophores, every Carpophore of the forest (GDD §4.1: "visible par tous"), and the whole
 * network of the colonies they listen to (M7 Écoute). Without fog (FOG_ENABLED false), every tile.
 */
export function visibleKeys(forest: ForestState, playerId: string, fog: boolean = FOG_ENABLED): Set<string> {
  const seen = new Set<string>();
  const viewer = forest.players.get(playerId);
  if (!fog) {
    for (const key of forest.tiles.keys()) seen.add(key);
    return seen;
  }
  const glowing = viewer !== undefined && hasMutation(viewer, "bioluminescence");
  const listened = new Set(viewer ? Object.entries(viewer.listens).filter(([, until]) => until > forest.updatedAt).map(([id]) => id) : []);
  for (const [key, t] of forest.tiles) {
    if (t.structure === "carpophore" && t.owner !== null) seen.add(key);
    if (t.owner !== null && listened.has(t.owner)) seen.add(key);
    if (t.owner !== playerId) continue;
    const vision = t.structure === "carpophore" && t.growthEndsAt === null ? STRUCTURES.carpophoreVision : VISION_RADIUS;
    for (const h of hexesInRadius(t, vision)) {
      const k = hexKey(h);
      if (forest.tiles.has(k)) seen.add(k);
    }
    if (glowing) {
      // Bioluminescence (GDD §4.2): enemy networks within 3 tiles.
      for (const h of hexesInRadius(t, MUTATIONS.bioluminescenceVision)) {
        const k = hexKey(h);
        const o = forest.tiles.get(k);
        if (o && o.owner !== null && o.owner !== playerId) seen.add(k);
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
  events?: ForestEvent[];
  pacts?: Pact[];
  invites?: PactInvite[];
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
    events: forest.events,
    pacts: forest.pacts,
    invites: forest.invites,
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
    events: Array.isArray(dto.events) ? dto.events : [],
    pacts: normalizePacts(dto.pacts),
    invites: normalizeInvites(dto.invites),
    updatedAt: dto.updatedAt,
  };
  refreshReservations(forest, forest.updatedAt);
  refreshPacts(forest);
  refreshToxins(forest);
  return forest;
}

/** Pacts from stored data. */
export function normalizePacts(raw: unknown): Pact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Pact => typeof p === "object" && p !== null && typeof p.id === "string" && Array.isArray(p.members))
    .map((p) => ({
      id: p.id,
      members: p.members.filter((m) => typeof m === "string"),
      former: Array.isArray(p.former) ? p.former.filter((m) => typeof m === "string") : [],
      createdAt: Number(p.createdAt) || 0,
      endedAt: typeof p.endedAt === "number" ? p.endedAt : null,
      leaving: { ...(p.leaving ?? {}) },
      marks: { ...(p.marks ?? {}) },
      banked: Number(p.banked) || 0,
    }));
}

/** Invitations from stored data. */
export function normalizeInvites(raw: unknown): PactInvite[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is PactInvite => typeof i === "object" && i !== null && typeof i.from === "string" && typeof i.to === "string" && typeof i.at === "number")
    .map((i) => ({ from: i.from, to: i.to, at: i.at }));
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
    heartShieldUntil: null,
    cooldowns: {},
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
