/**
 * Bookkeeping for the shared tiles (M9, simulation speed-up). Tiles are made by `makeTile`: their
 * `owner`, `growthEndsAt`, `structure` and `terrain` are accessors that tell the map's index when they
 * change. The index keeps, per map, the tiles of each owner (in map order), a version per owner and a
 * version for the whole map, and each tile's neighbours, so that the rules can answer "which tiles are
 * mine?", "how many?" or "has anything changed since?" without walking the whole forest.
 *
 * Reading a tile's fields is unchanged, and so is writing them: `tile.owner = "x"` updates the index.
 * Only those four fields are tracked; the others (`effects`, `level`, wear…) are read as they are. A
 * map holding any tile not made by `makeTile` (a plain object) is never indexed: every query then
 * scans the map, exactly as before.
 */
import type { StructureId, Terrain } from "./balance";
import type { Tile, TileEffect } from "./game";
import { HEX_DIRECTIONS, hexesInRadius } from "./hex";

/** Every field of a tile, as a plain object. */
export interface TileFields {
  q: number;
  r: number;
  terrain: Terrain;
  owner: string | null;
  growthEndsAt: number | null;
  growthStartedAt: number | null;
  exhaustion: number;
  disconnectedSince: number | null;
  capture: { by: string; progress: number } | null;
  reservedFor: string | null;
  structure: StructureId | null;
  toxic: boolean;
  effects: TileEffect[];
  level: number;
}

/** What a map knows about its tiles. */
class TileHome {
  /** Tiles in map order; a tile's position is its index. */
  readonly list: Tile[];
  /** The tiles' `q,r` keys, by index. */
  readonly keys: string[];
  /** Neighbours present on the map, in HEX_DIRECTIONS order, by index. */
  private neighbourLists: Array<Tile[] | undefined>;
  private readonly owned = new Map<string, { set: Set<Tile>; sorted: Tile[] | null }>();
  private readonly versions = new Map<string, number>();
  /** Bumped by every tracked change anywhere on the map. */
  epoch = 0;

  constructor(
    readonly tiles: Map<string, Tile>,
    list: Tile[],
  ) {
    this.list = list;
    this.keys = new Array<string>(list.length);
    this.neighbourLists = new Array(list.length);
    let i = 0;
    for (const [k, t] of tiles) {
      this.keys[i] = k;
      TrackedTile.attach(t as unknown as TrackedTile, this, i);
      if (t.owner !== null) this.ownedOf(t.owner).set.add(t);
      i++;
    }
  }

  private ownedOf(owner: string): { set: Set<Tile>; sorted: Tile[] | null } {
    let o = this.owned.get(owner);
    if (!o) {
      o = { set: new Set(), sorted: null };
      this.owned.set(owner, o);
    }
    return o;
  }

  /** The owner's tiles (growing ones included), in map order. The array is never changed afterwards. */
  ownedTiles(owner: string): readonly Tile[] {
    const o = this.owned.get(owner);
    if (!o) return EMPTY;
    if (o.sorted === null) o.sorted = [...o.set].sort((a, b) => indexOf(a) - indexOf(b));
    return o.sorted;
  }

  ownedCount(owner: string): number {
    return this.owned.get(owner)?.set.size ?? 0;
  }

  /** Tiles held by each owner. */
  counts(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [owner, o] of this.owned) if (o.set.size > 0) out.set(owner, o.set.size);
    return out;
  }

  version(owner: string): number {
    return this.versions.get(owner) ?? 0;
  }

  neighbours(t: Tile): Tile[] {
    const i = indexOf(t);
    let list = this.neighbourLists[i];
    if (!list) {
      list = [];
      for (const d of HEX_DIRECTIONS) {
        const n = this.tiles.get(`${t.q + d.q},${t.r + d.r}`);
        if (n) list.push(n);
      }
      this.neighbourLists[i] = list;
    }
    return list;
  }

  private readonly disks = new Map<number, Array<Tile[] | undefined>>();

  /** Tiles of the map within `radius` of `t`, in `hexesInRadius` order. */
  disk(t: Tile, radius: number): Tile[] {
    let byIndex = this.disks.get(radius);
    if (!byIndex) {
      byIndex = new Array(this.list.length);
      this.disks.set(radius, byIndex);
    }
    const i = indexOf(t);
    let list = byIndex[i];
    if (!list) {
      list = [];
      for (const h of hexesInRadius(t, radius)) {
        const n = this.tiles.get(`${h.q},${h.r}`);
        if (n) list.push(n);
      }
      byIndex[i] = list;
    }
    return list;
  }

  /** Whether each tile touches a wetland: -1 unknown, 0 no, 1 yes (reset when a wetland appears or goes). */
  private wet: Int8Array | null = null;

  touchesWetland(t: Tile): boolean {
    this.wet ??= new Int8Array(this.list.length).fill(-1);
    const i = indexOf(t);
    let v = this.wet[i]!;
    if (v < 0) {
      v = this.neighbours(t).some((n) => n.terrain === "wetland") ? 1 : 0;
      this.wet[i] = v;
    }
    return v === 1;
  }

  wetlandsChanged(): void {
    this.wet = null;
  }

  /** A tracked field of a tile of `owner` changed. */
  touched(owner: string | null): void {
    this.epoch++;
    if (owner !== null) this.versions.set(owner, this.version(owner) + 1);
  }

  ownerChanged(t: Tile, from: string | null, to: string | null): void {
    if (from !== null) {
      const o = this.ownedOf(from);
      o.set.delete(t);
      o.sorted = null;
      this.versions.set(from, this.version(from) + 1);
    }
    if (to !== null) {
      const o = this.ownedOf(to);
      o.set.add(t);
      o.sorted = null;
      this.versions.set(to, this.version(to) + 1);
    }
    this.epoch++;
  }
}

const EMPTY: readonly Tile[] = Object.freeze([]);

/** Accessors shared by every tracked tile (set in the class's static block). */
let DESCRIPTORS: PropertyDescriptorMap = {};

/**
 * A tile whose tracked fields report their changes to the map's index. Its fields are ordinary own
 * enumerable properties for every reader (spread, JSON, tests).
 */
class TrackedTile {
  #terrain: Terrain;
  #owner: string | null;
  #growthEndsAt: number | null;
  #structure: StructureId | null;
  #home: TileHome | null = null;
  #index = -1;

  constructor(f: TileFields) {
    this.#terrain = f.terrain;
    this.#owner = f.owner;
    this.#growthEndsAt = f.growthEndsAt;
    this.#structure = f.structure;
    const self = this as unknown as Record<string, unknown>;
    self.q = f.q;
    self.r = f.r;
    Object.defineProperties(this, DESCRIPTORS);
    self.growthStartedAt = f.growthStartedAt;
    self.exhaustion = f.exhaustion;
    self.disconnectedSince = f.disconnectedSince;
    self.capture = f.capture;
    self.reservedFor = f.reservedFor;
    self.toxic = f.toxic;
    self.effects = f.effects;
    self.level = f.level;
  }

  static attach(t: TrackedTile, home: TileHome, index: number): void {
    t.#home = home;
    t.#index = index;
  }

  static indexOf(t: TrackedTile): number {
    return t.#index;
  }

  static homeOf(t: TrackedTile): TileHome | null {
    return t.#home;
  }

  static {
    DESCRIPTORS = {
      terrain: {
        enumerable: true,
        get(this: TrackedTile) {
          return this.#terrain;
        },
        set(this: TrackedTile, v: Terrain) {
          const from = this.#terrain;
          if (v === from) return;
          this.#terrain = v;
          this.#home?.touched(this.#owner);
          if (from === "wetland" || v === "wetland") this.#home?.wetlandsChanged();
        },
      },
      owner: {
        enumerable: true,
        get(this: TrackedTile) {
          return this.#owner;
        },
        set(this: TrackedTile, v: string | null) {
          const from = this.#owner;
          if (v === from) return;
          this.#owner = v;
          this.#home?.ownerChanged(this as unknown as Tile, from, v);
        },
      },
      growthEndsAt: {
        enumerable: true,
        get(this: TrackedTile) {
          return this.#growthEndsAt;
        },
        set(this: TrackedTile, v: number | null) {
          if (v === this.#growthEndsAt) return;
          this.#growthEndsAt = v;
          this.#home?.touched(this.#owner);
        },
      },
      structure: {
        enumerable: true,
        get(this: TrackedTile) {
          return this.#structure;
        },
        set(this: TrackedTile, v: StructureId | null) {
          if (v === this.#structure) return;
          this.#structure = v;
          this.#home?.touched(this.#owner);
        },
      },
    };
  }
}

function indexOf(t: Tile): number {
  return TrackedTile.indexOf(t as unknown as TrackedTile);
}

/** A tile with tracked fields. Use it for every tile put in a map that the rules will read. */
export function makeTile(f: TileFields): Tile {
  return new TrackedTile(f) as unknown as Tile;
}

const homes = new WeakMap<Map<string, Tile>, TileHome | null>();

/**
 * The index of a map, built on first use (null if a tile of the map is a plain object). A map that
 * gained or lost tiles since is indexed again.
 */
function homeOf(tiles: Map<string, Tile>): TileHome | null {
  const home = homes.get(tiles);
  if (home !== undefined && (home === null ? untrackedSize.get(tiles) === tiles.size : home.list.length === tiles.size)) return home;
  const list = [...tiles.values()];
  if (!list.every((t) => t instanceof TrackedTile)) {
    homes.set(tiles, null);
    untrackedSize.set(tiles, tiles.size);
    return null;
  }
  const built = new TileHome(tiles, list);
  homes.set(tiles, built);
  return built;
}
const untrackedSize = new WeakMap<Map<string, Tile>, number>();

/** The index of `tiles`, if `t` is one of its tiles (fast path through the tile itself). */
function homeFor(tiles: Map<string, Tile>, t: object): TileHome | null {
  if (!(t instanceof TrackedTile)) return null;
  const own = TrackedTile.homeOf(t);
  if (own !== null && own.tiles === tiles && own.list.length === tiles.size && own.list[TrackedTile.indexOf(t)] === (t as unknown as Tile)) return own;
  const home = homeOf(tiles);
  return home !== null && TrackedTile.homeOf(t) === home ? home : null;
}

/** The tiles of `owner` (growing ones included), in map order. Do not change the returned array. */
export function ownedTilesOf(tiles: Map<string, Tile>, owner: string): readonly Tile[] {
  const home = homeOf(tiles);
  if (home) return home.ownedTiles(owner);
  const out: Tile[] = [];
  for (const t of tiles.values()) if (t.owner === owner) out.push(t);
  return out;
}

/** How many tiles `owner` holds, growing ones included. */
export function ownedCountOf(tiles: Map<string, Tile>, owner: string): number {
  const home = homeOf(tiles);
  if (home) return home.ownedCount(owner);
  let n = 0;
  for (const t of tiles.values()) if (t.owner === owner) n++;
  return n;
}

/** Tiles held by each owner. */
export function ownerCounts(tiles: Map<string, Tile>): Map<string, number> {
  const home = homeOf(tiles);
  if (home) return home.counts();
  const counts = new Map<string, number>();
  for (const t of tiles.values()) if (t.owner !== null) counts.set(t.owner, (counts.get(t.owner) ?? 0) + 1);
  return counts;
}

/** The neighbours of a tile that are on the map, in HEX_DIRECTIONS order. Do not change the returned array. */
export function neighbourTiles(tiles: Map<string, Tile>, t: Tile): readonly Tile[] {
  const home = homeFor(tiles, t);
  if (home) return home.neighbours(t);
  const out: Tile[] = [];
  for (const d of HEX_DIRECTIONS) {
    const n = tiles.get(`${t.q + d.q},${t.r + d.r}`);
    if (n) out.push(n);
  }
  return out;
}

/**
 * A number that changes whenever a tracked field of one of `owner`'s tiles changes (or a tile is won or
 * lost); null when the map is not indexed (nothing can be cached).
 */
export function ownerVersion(tiles: Map<string, Tile>, owner: string): number | null {
  const home = homeOf(tiles);
  return home ? home.version(owner) : null;
}

/** A number that changes whenever a tracked field of any tile changes; null when the map is not indexed. */
export function tilesEpoch(tiles: Map<string, Tile>): number | null {
  const home = homeOf(tiles);
  return home ? home.epoch : null;
}

/** The `q,r` key of a tile of an indexed map (no new string), or computed. */
export function tileKey(tiles: Map<string, Tile>, t: Tile): string {
  const home = homeFor(tiles, t);
  if (home) return home.keys[indexOf(t)]!;
  return `${t.q},${t.r}`;
}

/** Tiles of the map within `radius` of the tile `t`, in `hexesInRadius` order. Do not change the returned array. */
export function tilesWithin(tiles: Map<string, Tile>, t: Tile, radius: number): readonly Tile[] {
  const home = homeFor(tiles, t);
  if (home) return home.disk(t, radius);
  const out: Tile[] = [];
  for (const h of hexesInRadius(t, radius)) {
    const n = tiles.get(`${h.q},${h.r}`);
    if (n) out.push(n);
  }
  return out;
}

/** The tile of `tiles` at `h` when `h` is that tile itself (no lookup), otherwise undefined. */
export function asTileOf(tiles: Map<string, Tile>, h: object): Tile | undefined {
  return homeFor(tiles, h) ? (h as Tile) : undefined;
}

/** Whether the tile `h` touches a wetland (cached), or null if `h` is not a tile of an indexed `tiles`. */
export function touchesWetland(tiles: Map<string, Tile>, h: object): boolean | null {
  const home = homeFor(tiles, h);
  return home ? home.touchesWetland(h as Tile) : null;
}
