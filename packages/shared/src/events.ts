import {
  BOAR,
  CARCASS,
  DAY_PLACE,
  DYING_TREE,
  EVENT_KINDS,
  EVENTS,
  FIRE,
  NEMATODES,
  STORM,
  TREEFALL,
  type EventKind,
  type Terrain,
} from "./balance";
import { atFloor, refreshToxins, tileCounts, type ForestState } from "./forest";
import { forestPlacement, ringAt, zoneAt, type Placement } from "./forestgen";
import {
  EVENT_CASTER,
  networkHops,
  productionRate,
  refreshConnections,
  tileProduction,
  type Tile,
} from "./game";
import { HEX_DIRECTIONS, hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors, type Hex } from "./hex";
import { hashInts, mulberry32 } from "./rng";
import { phaseAt, seasonAt } from "./season";

/**
 * Random events and the world boss (GDD §7, M6). A season's events are drawn from the forest seed
 * when the forest opens: kind and time only. Each one is placed on the map when it is announced, an
 * hour before it starts, from the forest as it is then; players see it coming. Events are resolved by
 * `resolveEvents` on every tick, like the borders.
 */

export type EventStatus = "scheduled" | "announced" | "active" | "over";

export interface ForestEvent {
  /** Index in the season's schedule. */
  id: number;
  kind: EventKind;
  announceAt: number;
  startsAt: number;
  /** Equal to `startsAt` for instant events (Incendie, Sanglier, Chute d'arbre). */
  endsAt: number;
  status: EventStatus;
  /** Centre of the event and the tiles it covers, set when it is announced. */
  q: number;
  r: number;
  cells: Hex[];
  /** M9: the centre of each copy of an event of the day's zone (one per group of slices). */
  spots?: Hex[];
  /** Centred in the forest centre: stronger (GDD §2.5). */
  strong: boolean;
  /** Nématodes and Arbre mourant: life left and at the start. */
  hp?: number;
  maxHp?: number;
  /** Nématodes and Arbre mourant: what each player digested. */
  damage?: Record<string, number>;
  /** Nématodes: next bite. */
  nextBiteAt?: number;
  /** Tiles each player may still lose to this event (GDD: 10 % of their tiles at most). */
  budget?: Record<string, number>;
  /** Carcasse: the terrain to put back at the end. */
  restore?: Array<Hex & { terrain: Terrain }>;
  /** Nématodes and Arbre mourant: finished off before the end. */
  killed?: boolean;
}

/** What an event did, for the players' notices and the night journal. */
export interface EventOutcome {
  event: ForestEvent;
  phase: "announced" | "started" | "bite" | "ended";
  /** Tiles players lost to the event. */
  lost: Array<Hex & { player: string }>;
  /** Rewards of a world boss or of killed Nématodes. */
  rewards: Array<{ player: string; biomass: number; enzymes: number; trophy: boolean }>;
}

const HOUR = 3_600_000;
const MINUTE = 60_000;

const DURATIONS: Record<EventKind, number> = {
  storm: STORM.durationMs,
  fire: 0,
  boar: 0,
  treefall: 0,
  carcass: CARCASS.durationMs,
  nematodes: NEMATODES.durationMs,
  tree: DYING_TREE.durationMs,
};

function scheduled(id: number, kind: EventKind, startsAt: number): ForestEvent {
  return {
    id,
    kind,
    announceAt: startsAt - EVENTS.announceMs,
    startsAt,
    endsAt: startsAt + DURATIONS[kind],
    status: "scheduled",
    q: 0,
    r: 0,
    cells: [],
    strong: false,
  };
}

/**
 * The events of the season that starts at `seasonStart`: 1 to 3 random ones a day from Tuesday to
 * Sunday, a Chute d'arbre on Thursday morning, and the Arbre mourant on Thursday and Sunday at 14:00.
 * Events announced before `from` are dropped (a forest opening mid-week).
 */
export function scheduleEvents(seed: number, seasonStart: number, from = seasonStart): ForestEvent[] {
  const days = seasonAt(seasonStart).days;
  const rng = mulberry32(hashInts(seed, Math.floor(seasonStart / MINUTE), 0xe7e7));
  const list: Array<{ kind: EventKind; at: number }> = [];
  for (let d = 1; d <= 6; d++) {
    const n = EVENTS.perDay.min + Math.floor(rng() * (EVENTS.perDay.max - EVENTS.perDay.min + 1));
    for (let k = 0; k < n; k++) {
      const weights = EVENT_KINDS.map((kind) => (kind === "storm" && d === 1 ? EVENTS.springStormWeight : (EVENTS.weights[kind] ?? 0)));
      const total = weights.reduce((a, b) => a + b, 0);
      let x = rng() * total;
      let kind: EventKind = "storm";
      for (let i = 0; i < EVENT_KINDS.length; i++) {
        x -= weights[i]!;
        if (x < 0) {
          kind = EVENT_KINDS[i]!;
          break;
        }
      }
      const hour = EVENTS.hours.from + rng() * (EVENTS.hours.to - EVENTS.hours.from);
      list.push({ kind, at: days[d]! + Math.floor((hour * HOUR) / MINUTE) * MINUTE });
    }
  }
  list.push({ kind: "treefall", at: days[3]! + TREEFALL.hour * HOUR });
  for (const d of DYING_TREE.days) list.push({ kind: "tree", at: days[d]! + DYING_TREE.hour * HOUR });
  list.sort((a, b) => a.at - b.at || EVENT_KINDS.indexOf(a.kind) - EVENT_KINDS.indexOf(b.kind));
  return list.map((e, i) => scheduled(i, e.kind, e.at)).filter((e) => e.announceAt >= from);
}

// ---------------------------------------------------------------------------
// Placement (at announce time)

const isLand = (t: Tile) => t.terrain !== "wetland" && t.terrain !== "tree";

/** Tiles in a stable order (the store may load them in any order). */
function sortedTiles(forest: ForestState): Tile[] {
  return [...forest.tiles.values()].sort((a, b) => a.q - b.q || a.r - b.r);
}

function pick<T>(list: readonly T[], rng: () => number): T | undefined {
  return list.length === 0 ? undefined : list[Math.floor(rng() * list.length)];
}

/** A Cœur or a grown Sclérote: never taken by an event. */
function isSheltered(forest: ForestState, t: Tile): boolean {
  if (t.owner === null) return false;
  const owner = forest.players.get(t.owner);
  return (owner !== undefined && hexEquals(owner.heart, t)) || (t.structure === "sclerotium" && t.growthEndsAt === null);
}

function zone(forest: ForestState, centre: Hex, radius: number): Hex[] {
  return hexesInRadius(centre, radius).filter((h) => forest.tiles.has(hexKey(h)));
}

/** Chooses where the event happens, from the forest as it is at announce time. */
export function placeEvent(forest: ForestState, e: ForestEvent): void {
  const rng = mulberry32(hashInts(forest.seed, e.id, Math.floor(e.startsAt / MINUTE), 0x5eed));
  const tiles = sortedTiles(forest);
  const land = tiles.filter(isLand);
  let centre: Hex = pick(land, rng) ?? { q: 0, r: 0 };
  const strongAt = (h: Hex) => ringAt(forest.radius, h) === "centre";
  let cells: Hex[] = [];
  switch (e.kind) {
    case "storm":
      cells = zone(forest, centre, STORM.radius);
      break;
    case "fire":
      cells = zone(forest, centre, FIRE.radius + (strongAt(centre) ? 1 : 0));
      break;
    case "boar": {
      const dir = HEX_DIRECTIONS[Math.floor(rng() * 6)]!;
      const base = BOAR.minLength + Math.floor(rng() * (BOAR.maxLength - BOAR.minLength + 1));
      const length = Math.round(base * (strongAt(centre) ? EVENTS.centreStrength : 1));
      for (let i = 0; i < length; i++) {
        const h = { q: centre.q + dir.q * i, r: centre.r + dir.r * i };
        const t = forest.tiles.get(hexKey(h));
        if (!t || !isLand(t)) break;
        cells.push(h);
      }
      break;
    }
    case "treefall": {
      // M9: in the zone of the day, the same places in every group of slices.
      const places = dayPlaces(forest, e);
      const fits = (t: Tile | undefined): t is Tile => t !== undefined && isLand(t) && t.terrain !== "rock" && t.terrain !== "stump" && t.terrain !== "carcass";
      const pool = places.reference.filter(fits);
      const n = TREEFALL.minStumps + Math.floor(rng() * (TREEFALL.maxStumps - TREEFALL.minStumps + 1));
      const perCopy = Math.ceil(n / places.copies);
      const picked: Tile[] = [];
      for (let i = 0; i < perCopy && pool.length > 0; i++) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
      const taken = new Set<Tile>();
      for (let g = 0; g < places.copies; g++) {
        for (const t of picked) {
          const copy = places.copyOf(t, g);
          if (fits(copy) && !taken.has(copy)) {
            taken.add(copy);
            cells.push(copy);
          }
        }
      }
      e.spots = Array.from({ length: places.copies }, (_, g) => places.copyOf(picked[0] ?? centre, g)).filter((t): t is Tile => t !== undefined).map((t) => ({ q: t.q, r: t.r }));
      centre = cells[0] ?? centre;
      break;
    }
    case "carcass": {
      const wild = land.filter((t) => t.owner === null && t.reservedFor === null && ["litter", "humus", "deadwood"].includes(t.terrain));
      centre = pick(wild, rng) ?? centre;
      cells = [centre];
      break;
    }
    case "nematodes": {
      // They go where colonies are: next to a random grown tile.
      const owned = land.filter((t) => t.owner !== null && t.growthEndsAt === null && !isSheltered(forest, t));
      centre = pick(owned, rng) ?? centre;
      cells = zone(forest, centre, NEMATODES.radius);
      break;
    }
    case "tree": {
      // M9: one 7-tile cluster per group of slices, in the zone of the day, at the same place in every
      // group: the place whose clusters hold the fewest colonised tiles, nearest the middle; no Cœur,
      // Sclérote or wetland in any of them.
      const places = dayPlaces(forest, e);
      let best: { centre: Hex; spots: Hex[]; clusters: Hex[][]; key: [number, number, number, number, number] } | null = null;
      for (const t of places.reference) {
        // Whole clusters inside the zone first.
        let outside = 0;
        const clusters: Hex[][] = [];
        const spots: Hex[] = [];
        let colonised = 0;
        let ok = true;
        for (let g = 0; g < places.copies && ok; g++) {
          const c = places.copyOf(t, g);
          if (!c) {
            ok = false;
            break;
          }
          const cluster = hexesInRadius(c, 1).map((h) => forest.tiles.get(hexKey(h)));
          if (cluster.some((x) => !x || !isLand(x) || isSheltered(forest, x))) ok = false;
          colonised += cluster.filter((x) => x?.owner !== null).length;
          outside += cluster.filter((x) => x !== undefined && zoneAt(forest.layout, forest.radius, x) !== places.zone).length;
          clusters.push(zone(forest, c, 1));
          spots.push({ q: c.q, r: c.r });
        }
        if (!ok) continue;
        const key: [number, number, number, number, number] = [outside > 0 ? 1 : 0, colonised, hexDistance(t, { q: 0, r: 0 }), t.q, t.r];
        if (!best || compare(key, best.key) < 0) best = { centre: t, spots, clusters, key };
      }
      // Copies may touch on a small map: each tile once.
      const seen = new Set<string>();
      cells = (best ? best.clusters.flat() : zone(forest, { q: 0, r: 0 }, 1)).filter((h) => !seen.has(hexKey(h)) && seen.add(hexKey(h)) !== undefined);
      centre = best ? best.centre : { q: 0, r: 0 };
      if (best) e.spots = best.spots;
      break;
    }
  }
  e.q = centre.q;
  e.r = centre.r;
  e.cells = cells.map((h) => ({ q: h.q, r: h.r }));
  e.strong = strongAt(centre) && e.kind !== "tree" && e.kind !== "treefall";
}

/**
 * Where the events of the day's zone go (M9): `reference` holds the tiles of the zone of the day in the first
 * group of DAY_PLACE.copiesEvery slices, in map order; `copyOf(t, g)` is the tile at the same place (same
 * band and position in its slice) in group `g`.
 */
function dayPlaces(forest: ForestState, e: ForestEvent): { zone: number; reference: Tile[]; copies: number; copyOf: (t: Hex, g: number) => Tile | undefined } {
  const capacity = forest.layout.capacity;
  const every = Math.max(1, Math.min(capacity, DAY_PLACE.copiesEvery));
  const copies = Math.max(1, Math.floor(capacity / every));
  const placement = forestPlacement(capacity, forest.radius);
  const day = phaseAt(e.startsAt).index + 1;
  const bySpot = new Map<string, Tile>();
  const reference: Tile[] = [];
  const spot = (pl: Placement, slice: number) => `${pl.band}:${slice}:${pl.p}`;
  for (const t of sortedTiles(forest)) {
    const pl = placement.get(hexKey(t));
    if (!pl) continue;
    bySpot.set(spot(pl, pl.slice), t);
    if (pl.slice < every && zoneAt(forest.layout, forest.radius, t) === day) reference.push(t);
  }
  const copyOf = (h: Hex, g: number) => {
    const pl = placement.get(hexKey(h));
    return pl ? bySpot.get(spot(pl, (pl.slice + g * every) % capacity)) : undefined;
  };
  return { zone: day, reference, copies, copyOf };
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

// ---------------------------------------------------------------------------
// Resolution

/** Brings the events up to `now`: announces, starts, runs and ends them. Returns what happened. */
export function resolveEvents(forest: ForestState, dt: number, now: number): EventOutcome[] {
  if (!forest.calendar) return [];
  ensureSchedule(forest, now);
  const out: EventOutcome[] = [];
  for (const e of forest.events) {
    if (e.status === "over") continue;
    if (e.status === "scheduled" && now >= e.announceAt) {
      placeEvent(forest, e);
      e.status = "announced";
      out.push(outcome(e, "announced"));
    }
    if (e.status === "announced" && now >= e.startsAt) {
      out.push(startEvent(forest, e, now));
      if (e.endsAt <= e.startsAt) {
        e.status = "over";
        continue;
      }
    }
    if (e.status === "active") {
      const step = Math.max(0, Math.min(dt, now - e.startsAt, e.endsAt - (now - dt)));
      out.push(...tickEvent(forest, e, step, now));
      if (e.killed || now >= e.endsAt) out.push(endEvent(forest, e));
    }
  }
  if (out.some((o) => o.lost.length > 0 || o.phase === "started" || o.phase === "ended")) {
    for (const p of forest.players.values()) refreshConnections(p, now);
    refreshToxins(forest);
  }
  return out;
}

/** Draws the season's events the first time a calendar forest needs them. */
export function ensureSchedule(forest: ForestState, now: number): void {
  if (forest.events.length > 0 || !forest.calendar) return;
  forest.events = scheduleEvents(forest.seed, seasonAt(now).start, now);
  // An empty list would be drawn again: keep a marker if the week has nothing left.
  if (forest.events.length === 0) forest.events = [{ ...scheduled(-1, "storm", 0), status: "over" }];
}

function outcome(e: ForestEvent, phase: EventOutcome["phase"]): EventOutcome {
  return { event: e, phase, lost: [], rewards: [] };
}

/** Releases a tile (the event takes it), keeping only the event effects on it. */
function release(t: Tile): void {
  t.owner = null;
  t.structure = null;
  t.growthEndsAt = null;
  t.growthStartedAt = null;
  t.disconnectedSince = null;
  t.capture = null;
  t.level = 0;
  t.effects = t.effects.filter((x) => x.by === EVENT_CASTER);
}

/** Takes the tile from its owner if the event may (shelters, 10 % budget, floor of tiles). */
function tryTake(forest: ForestState, e: ForestEvent, t: Tile, out: EventOutcome, counts: Map<string, number>): boolean {
  if (t.owner === null || isSheltered(forest, t)) return false;
  const owner = t.owner;
  const left = e.budget?.[owner] ?? 0;
  if (left <= 0 || atFloor(counts, owner)) return false;
  e.budget![owner] = left - 1;
  counts.set(owner, (counts.get(owner) ?? 1) - 1);
  out.lost.push({ q: t.q, r: t.r, player: owner });
  release(t);
  return true;
}

function startEvent(forest: ForestState, e: ForestEvent, now: number): EventOutcome {
  const out = outcome(e, "started");
  e.status = "active";
  const counts = tileCounts(forest);
  e.budget = Object.fromEntries([...forest.players.keys()].map((id) => [id, Math.floor((counts.get(id) ?? 0) * EVENTS.maxLossShare)]));
  const cells = e.cells.map((h) => forest.tiles.get(hexKey(h))).filter((t): t is Tile => t !== undefined);
  const strength = e.strong ? EVENTS.centreStrength : 1;
  switch (e.kind) {
    case "storm":
      for (const t of cells) t.effects = [...t.effects, { kind: "storm", by: EVENT_CASTER, until: e.endsAt, power: STORM.bonus * strength }];
      break;
    case "fire":
      for (const t of cells) {
        if (!isLand(t)) continue;
        tryTake(forest, e, t, out, counts);
        t.effects = [...t.effects.filter((x) => x.kind !== "ashes"), { kind: "ashes", by: EVENT_CASTER, until: e.startsAt + FIRE.ashesMs, power: FIRE.ashesFactor }];
      }
      break;
    case "boar":
      for (const t of cells) {
        tryTake(forest, e, t, out, counts);
      }
      break;
    case "treefall":
      for (const t of cells) {
        t.terrain = "stump";
      }
      break;
    case "carcass":
      e.restore = cells.map((t) => ({ q: t.q, r: t.r, terrain: t.terrain }));
      for (const t of cells) {
        t.terrain = "carcass";
      }
      break;
    case "nematodes": {
      let local = 0;
      for (const p of forest.players.values()) {
        const hops = networkHops(p, now);
        for (const t of cells) if (t.owner === p.id) local += tileProduction(p, t, hops, now);
      }
      e.maxHp = Math.max(NEMATODES.minHp, local * NEMATODES.hpHours * 3600) * strength;
      e.hp = e.maxHp;
      e.damage = {};
      e.nextBiteAt = e.startsAt + NEMATODES.biteMs / strength;
      break;
    }
    case "tree": {
      let total = 0;
      for (const p of forest.players.values()) total += productionRate(p, now);
      e.maxHp = Math.max(DYING_TREE.minHp, total * DYING_TREE.hpHours * 3600);
      e.hp = e.maxHp;
      e.damage = {};
      for (const t of cells) {
        tryTake(forest, e, t, out, counts);
        t.terrain = "tree";
      }
      break;
    }
  }
  return out;
}

function tickEvent(forest: ForestState, e: ForestEvent, dt: number, now: number): EventOutcome[] {
  const out: EventOutcome[] = [];
  const cells = e.cells.map((h) => forest.tiles.get(hexKey(h))).filter((t): t is Tile => t !== undefined);
  if (e.kind === "nematodes") {
    // Digested by the production of the players' tiles in the zone.
    if (dt > 0) {
      for (const p of forest.players.values()) {
        const hops = networkHops(p, now);
        let rate = 0;
        for (const t of cells) if (t.owner === p.id) rate += tileProduction(p, t, hops, now);
        hit(e, p.id, (rate * dt) / 1000);
      }
    }
    if ((e.hp ?? 0) <= 0) {
      e.killed = true;
      return out;
    }
    while (e.nextBiteAt !== undefined && e.nextBiteAt <= now && e.nextBiteAt < e.endsAt) {
      const bite = outcome(e, "bite");
      const counts = tileCounts(forest);
      const rng = mulberry32(hashInts(forest.seed, e.id, Math.floor(e.nextBiteAt / MINUTE)));
      const prey = cells.filter((t) => t.owner !== null && !isSheltered(forest, t) && (e.budget?.[t.owner] ?? 0) > 0 && !atFloor(counts, t.owner));
      const t = pick(prey, rng);
      if (t) tryTake(forest, e, t, bite, counts);
      if (bite.lost.length > 0) out.push(bite);
      e.nextBiteAt += NEMATODES.biteMs / (e.strong ? EVENTS.centreStrength : 1);
    }
  }
  if (e.kind === "tree" && dt > 0) {
    // Every player touching the tree digests it with their whole production.
    const keys = new Set(e.cells.map(hexKey));
    for (const p of forest.players.values()) {
      const hops = networkHops(p, now);
      const touching = [...hops.keys()].some((k) => {
        const t = forest.tiles.get(k)!;
        return hexNeighbors(t).some((n) => keys.has(hexKey(n)));
      });
      if (touching) hit(e, p.id, (productionRate(p, now) * dt) / 1000);
    }
    if ((e.hp ?? 0) <= 0) e.killed = true;
  }
  return out;
}

function hit(e: ForestEvent, player: string, amount: number): void {
  if (amount <= 0 || (e.hp ?? 0) <= 0) return;
  const dealt = Math.min(amount, e.hp!);
  e.hp! -= dealt;
  e.damage![player] = (e.damage![player] ?? 0) + dealt;
}

function endEvent(forest: ForestState, e: ForestEvent): EventOutcome {
  const out = outcome(e, "ended");
  e.status = "over";
  const cells = e.cells.map((h) => forest.tiles.get(hexKey(h))).filter((t): t is Tile => t !== undefined);
  if (e.kind === "carcass") {
    for (const r of e.restore ?? []) {
      const t = forest.tiles.get(hexKey(r));
      if (t && t.terrain === "carcass") t.terrain = r.terrain;
    }
  }
  if (e.kind === "nematodes" && e.killed) {
    for (const [player, dealt] of Object.entries(e.damage ?? {})) {
      const p = forest.players.get(player);
      if (!p || dealt <= 0) continue;
      const biomass = dealt * NEMATODES.rewardFactor;
      p.biomass += biomass;
      out.rewards.push({ player, biomass, enzymes: 0, trophy: false });
    }
  }
  if (e.kind === "tree") {
    const total = Object.values(e.damage ?? {}).reduce((a, b) => a + b, 0);
    const digested = e.maxHp ? Math.min(1, total / e.maxHp) : 0;
    const top = Object.entries(e.damage ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    for (const [player, dealt] of Object.entries(e.damage ?? {})) {
      const p = forest.players.get(player);
      if (!p || dealt <= 0) continue;
      const biomass = dealt * DYING_TREE.biomassFactor;
      const enzymes = total > 0 ? DYING_TREE.enzymes * digested * (dealt / total) : 0;
      p.biomass += biomass;
      p.enzymes += enzymes;
      if (player === top) p.trophies += 1;
      out.rewards.push({ player, biomass, enzymes, trophy: player === top });
    }
    // The dead tree leaves Stumps.
    for (const t of cells) {
      if (t.terrain === "tree") t.terrain = "stump";
    }
  }
  return out;
}

/** Events players can see: announced or under way. */
export function visibleEvents(forest: ForestState): ForestEvent[] {
  return forest.events.filter((e) => e.status === "announced" || e.status === "active");
}

// ---------------------------------------------------------------------------
// What players are told

/** An event as the players see it (every event is public once announced). */
export interface EventDto {
  id: number;
  kind: EventKind;
  status: "announced" | "active";
  startsAt: number;
  endsAt: number;
  q: number;
  r: number;
  cells: Hex[];
  /** M9: the centre of each copy of an event of the day's zone (one per group of slices). */
  spots?: Hex[];
  strong: boolean;
  /** Nématodes and Arbre mourant: share of life left (0 to 1), and what this player digested. */
  life?: number;
  mine?: number;
  /** Share of the damage done by this player so far (0 to 1). */
  share?: number;
}

/** Something an event did that concerns this player. */
export interface EventNotice {
  kind: EventKind;
  /** announced: coming in an hour; started: a world boss or Nématodes are there; lost: tiles taken; reward: boss or Nématodes paid. */
  phase: "announced" | "started" | "lost" | "reward";
  q: number;
  r: number;
  tiles?: number;
  biomass?: number;
  enzymes?: number;
  trophy?: boolean;
}

export function eventView(e: ForestEvent, playerId: string): EventDto {
  const dto: EventDto = {
    id: e.id,
    kind: e.kind,
    status: e.status === "active" ? "active" : "announced",
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    q: e.q,
    r: e.r,
    cells: e.cells.map((h) => ({ q: h.q, r: h.r })),
    strong: e.strong,
  };
  if (e.spots) dto.spots = e.spots.map((h) => ({ q: h.q, r: h.r }));
  if (e.maxHp !== undefined && e.hp !== undefined) {
    dto.life = Math.max(0, e.hp) / e.maxHp;
    const damage = e.damage ?? {};
    const total = Object.values(damage).reduce((a, b) => a + b, 0);
    dto.mine = damage[playerId] ?? 0;
    dto.share = total > 0 ? dto.mine / total : 0;
  }
  return dto;
}

/** The notices of one player from a tick's outcomes. */
export function eventNotices(outcomes: readonly EventOutcome[], playerId: string): EventNotice[] {
  const out: EventNotice[] = [];
  for (const o of outcomes) {
    const at = { kind: o.event.kind, q: o.event.q, r: o.event.r };
    if (o.phase === "announced") out.push({ ...at, phase: "announced" });
    if (o.phase === "started" && (o.event.kind === "tree" || o.event.kind === "nematodes")) out.push({ ...at, phase: "started" });
    const lost = o.lost.filter((l) => l.player === playerId).length;
    if (lost > 0) out.push({ ...at, phase: "lost", tiles: lost });
    const reward = o.rewards.find((r) => r.player === playerId);
    if (reward) out.push({ ...at, phase: "reward", biomass: reward.biomass, enzymes: reward.enzymes, trophy: reward.trophy });
  }
  return out;
}
