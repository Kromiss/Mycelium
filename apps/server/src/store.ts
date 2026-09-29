import {
  deserializeForest,
  forestSpawns,
  hexKey,
  normalizeUpgrades,
  refreshReservations,
  serializeForest,
  TERRAIN_STATS,
  type ForestState,
  type GameState,
  type PlayerInfo,
  type Terrain,
  type Tile,
} from "@mycelium/shared";
import { randomUUID } from "node:crypto";
import type pg from "pg";

export class NameTakenError extends Error {
  constructor() {
    super("name_taken");
  }
}

export interface Account extends PlayerInfo {
  /** scrypt hash, null for guest accounts from M1–M2 and for robots. */
  passwordHash: string | null;
  isBot: boolean;
}

export interface ForestRecord {
  id: string;
  /** Human-friendly number ("Forêt #12"). */
  number: number;
}

export interface LoadedForest {
  record: ForestRecord;
  forest: ForestState;
  members: Map<string, Account>;
}

/** Where accounts, sessions and forests live. The server keeps forests in memory and saves them here. */
export interface GameStore {
  /** Throws NameTakenError if the name is used (case-insensitive). */
  createAccount(name: string, passwordHash: string | null, isBot?: boolean): Promise<Account>;
  findAccountByName(name: string): Promise<Account | null>;
  setPassword(playerId: string, passwordHash: string): Promise<void>;
  createSession(playerId: string, tokenHash: string): Promise<void>;
  /** Session token, or the guest token of an M1–M2 account. */
  findAccountBySession(tokenHash: string): Promise<Account | null>;
  deleteSession(tokenHash: string): Promise<void>;
  listForests(): Promise<ForestRecord[]>;
  createForest(forest: ForestState): Promise<ForestRecord>;
  loadForest(id: string): Promise<LoadedForest | null>;
  /** Saves every player and tile of the forest (players who joined become members). */
  saveForest(id: string, forest: ForestState): Promise<void>;
}

// ---------------------------------------------------------------------------

/** In-process store, used when DATABASE_URL is not set (local dev) and in tests. Lost on restart. */
export class MemoryStore implements GameStore {
  private readonly accounts = new Map<string, Account>();
  private readonly sessions = new Map<string, string>();
  private readonly forests = new Map<string, { record: ForestRecord; json: string }>();
  private nextForest = 1;

  async createAccount(name: string, passwordHash: string | null, isBot = false): Promise<Account> {
    if (await this.findAccountByName(name)) throw new NameTakenError();
    const account = { id: randomUUID(), name, passwordHash, isBot };
    this.accounts.set(account.id, account);
    return { ...account };
  }

  async findAccountByName(name: string): Promise<Account | null> {
    const lower = name.toLowerCase();
    for (const a of this.accounts.values()) if (a.name.toLowerCase() === lower) return { ...a };
    return null;
  }

  async setPassword(playerId: string, passwordHash: string): Promise<void> {
    const a = this.accounts.get(playerId);
    if (a) a.passwordHash = passwordHash;
  }

  async createSession(playerId: string, tokenHash: string): Promise<void> {
    this.sessions.set(tokenHash, playerId);
  }

  async findAccountBySession(tokenHash: string): Promise<Account | null> {
    const id = this.sessions.get(tokenHash);
    const a = id ? this.accounts.get(id) : undefined;
    return a ? { ...a } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async listForests(): Promise<ForestRecord[]> {
    return [...this.forests.values()].map((f) => ({ ...f.record }));
  }

  async createForest(forest: ForestState): Promise<ForestRecord> {
    const record = { id: randomUUID(), number: this.nextForest++ };
    this.forests.set(record.id, { record, json: JSON.stringify(serializeForest(forest)) });
    return { ...record };
  }

  async loadForest(id: string): Promise<LoadedForest | null> {
    const f = this.forests.get(id);
    if (!f) return null;
    const forest = deserializeForest(JSON.parse(f.json));
    const members = new Map<string, Account>();
    for (const pid of forest.players.keys()) {
      const a = this.accounts.get(pid);
      if (a) members.set(pid, { ...a });
    }
    return { record: { ...f.record }, forest, members };
  }

  async saveForest(id: string, forest: ForestState): Promise<void> {
    const f = this.forests.get(id);
    if (f) f.json = JSON.stringify(serializeForest(forest));
  }
}

// ---------------------------------------------------------------------------

interface AccountRow {
  id: string;
  name: string;
  password_hash: string | null;
  is_bot: boolean;
}

interface PlayerRow extends AccountRow {
  heart_q: number;
  heart_r: number;
  heart_moved_at: Date | null;
  spawn_q: number;
  spawn_r: number;
  joined_at: Date;
  trophies: number;
  nutrients: number;
  biomass: number;
  upgrades: Record<string, number>;
  queue: Array<{ q: number; r: number }>;
  last_seen_at: Date | null;
  updated_at: Date;
}

interface HexRow {
  q: number;
  r: number;
  terrain: Terrain;
  owner_id: string | null;
  growth_ends_at: Date | null;
  growth_started_at: Date | null;
  exhaustion: number;
  disconnected_since: Date | null;
  capture_by: string | null;
  capture_progress: number | null;
}

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const toMs = (d: Date | null) => (d === null ? null : d.getTime());
const toAccount = (r: AccountRow): Account => ({ id: r.id, name: r.name, passwordHash: r.password_hash, isBot: r.is_bot });

/** PostgreSQL store (tables from migrations 0001 to 0005). */
export class PgStore implements GameStore {
  constructor(private readonly pool: pg.Pool) {}

  async createAccount(name: string, passwordHash: string | null, isBot = false): Promise<Account> {
    try {
      const res = await this.pool.query<AccountRow>(
        `insert into players (name, password_hash, is_bot)
         select $1, $2, $3 where not exists (select 1 from players where lower(name) = lower($1))
         returning id, name, password_hash, is_bot`,
        [name, passwordHash, isBot],
      );
      if (!res.rows[0]) throw new NameTakenError();
      return toAccount(res.rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") throw new NameTakenError();
      throw err;
    }
  }

  async findAccountByName(name: string): Promise<Account | null> {
    const res = await this.pool.query<AccountRow>(
      "select id, name, password_hash, is_bot from players where lower(name) = lower($1)",
      [name],
    );
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async setPassword(playerId: string, passwordHash: string): Promise<void> {
    await this.pool.query("update players set password_hash = $2 where id = $1", [playerId, passwordHash]);
  }

  async createSession(playerId: string, tokenHash: string): Promise<void> {
    await this.pool.query("insert into sessions (token_hash, player_id) values ($1, $2)", [tokenHash, playerId]);
  }

  async findAccountBySession(tokenHash: string): Promise<Account | null> {
    const res = await this.pool.query<AccountRow>(
      `with s as (update sessions set last_used_at = now() where token_hash = $1 returning player_id)
       select p.id, p.name, p.password_hash, p.is_bot from players p
       where p.id in (select player_id from s) or p.token_hash = $1
       limit 1`,
      [tokenHash],
    );
    return res.rows[0] ? toAccount(res.rows[0]) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query("delete from sessions where token_hash = $1", [tokenHash]);
  }

  async listForests(): Promise<ForestRecord[]> {
    const res = await this.pool.query<ForestRecord>("select id, number from forests order by number");
    return res.rows;
  }

  async createForest(forest: ForestState): Promise<ForestRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const world = await client.query<{ id: string }>(
        "insert into worlds (seed, radius, layout, capacity) values ($1, $2, 'forest', $3) returning id",
        [forest.seed, forest.radius, forest.layout.capacity],
      );
      const worldId = world.rows[0]!.id;
      const rec = await client.query<ForestRecord>(
        "insert into forests (world_id, updated_at) values ($1, $2) returning id, number",
        [worldId, new Date(forest.updatedAt)],
      );
      const tiles = [...forest.tiles.values()];
      await client.query(
        `insert into hex (world_id, q, r, terrain, reserve)
         select $1, t.q, t.r, t.terrain, t.reserve
         from unnest($2::int[], $3::int[], $4::text[], $5::float8[]) as t(q, r, terrain, reserve)`,
        [
          worldId,
          tiles.map((t) => t.q),
          tiles.map((t) => t.r),
          tiles.map((t) => t.terrain),
          tiles.map((t) => TERRAIN_STATS[t.terrain].reserve),
        ],
      );
      await client.query("commit");
      return rec.rows[0]!;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async loadForest(id: string): Promise<LoadedForest | null> {
    const res = await this.pool.query<{
      id: string;
      number: number;
      world_id: string;
      seed: string;
      radius: number;
      capacity: number;
      updated_at: Date;
    }>(
      `select f.id, f.number, f.world_id, w.seed, w.radius, w.capacity, f.updated_at
       from forests f join worlds w on w.id = f.world_id where f.id = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    const hexes = await this.pool.query<HexRow>(
      `select q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since,
              capture_by, capture_progress
       from hex where world_id = $1`,
      [row.world_id],
    );
    const tiles = new Map<string, Tile>();
    for (const h of hexes.rows) {
      tiles.set(hexKey(h), {
        q: h.q,
        r: h.r,
        terrain: h.terrain,
        owner: h.owner_id,
        growthEndsAt: toMs(h.growth_ends_at),
        growthStartedAt: h.growth_ends_at ? toMs(h.growth_started_at) : null,
        exhaustion: h.exhaustion,
        disconnectedSince: toMs(h.disconnected_since),
        capture: h.capture_by && h.capture_progress !== null ? { by: h.capture_by, progress: h.capture_progress } : null,
        reservedFor: null,
      });
    }
    const layout = { kind: "forest", capacity: row.capacity } as const;
    const seed = Number(row.seed);
    const players = await this.pool.query<PlayerRow>(
      `select id, name, password_hash, is_bot, heart_q, heart_r, heart_moved_at, spawn_q, spawn_r, joined_at, trophies,
              nutrients, biomass, upgrades, queue, last_seen_at, updated_at
       from players where forest_id = $1`,
      [id],
    );
    const members = new Map<string, Account>();
    const states = new Map<string, GameState>();
    for (const p of players.rows) {
      members.set(p.id, toAccount(p));
      states.set(p.id, {
        id: p.id,
        seed,
        radius: row.radius,
        layout,
        spawn: { q: p.spawn_q, r: p.spawn_r },
        joinedAt: p.joined_at.getTime(),
        trophies: p.trophies,
        heart: { q: p.heart_q, r: p.heart_r },
        heartMovedAt: toMs(p.heart_moved_at),
        nutrients: p.nutrients,
        biomass: p.biomass,
        upgrades: normalizeUpgrades(p.upgrades),
        queue: Array.isArray(p.queue) ? p.queue.filter((h) => Number.isInteger(h?.q) && Number.isInteger(h?.r)) : [],
        lastSeenAt: toMs(p.last_seen_at),
        tiles,
        updatedAt: p.updated_at.getTime(),
      });
    }
    const forest: ForestState = {
      seed,
      radius: row.radius,
      layout,
      spawns: forestSpawns(row.capacity, row.radius),
      tiles,
      players: states,
      updatedAt: row.updated_at.getTime(),
    };
    refreshReservations(forest, forest.updatedAt);
    return { record: { id: row.id, number: row.number }, forest, members };
  }

  async saveForest(id: string, forest: ForestState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const res = await client.query<{ world_id: string }>(
        "update forests set updated_at = $2 where id = $1 returning world_id",
        [id, new Date(forest.updatedAt)],
      );
      const worldId = res.rows[0]?.world_id;
      if (!worldId) throw new Error(`Unknown forest ${id}`);
      const ps = [...forest.players.values()];
      if (ps.length > 0) {
        await client.query(
          `update players set forest_id = $1, world_id = $2, heart_q = t.heart_q, heart_r = t.heart_r,
                  heart_moved_at = t.heart_moved_at, spawn_q = t.spawn_q, spawn_r = t.spawn_r, joined_at = t.joined_at,
                  trophies = t.trophies, nutrients = t.nutrients, biomass = t.biomass, upgrades = t.upgrades::jsonb,
                  queue = t.queue::jsonb, last_seen_at = t.last_seen_at, updated_at = t.updated_at
           from unnest($3::uuid[], $4::int[], $5::int[], $6::timestamptz[], $7::int[], $8::int[], $9::timestamptz[],
                       $10::int[], $11::float8[], $12::float8[], $13::text[], $14::text[], $15::timestamptz[],
                       $16::timestamptz[])
             as t(id, heart_q, heart_r, heart_moved_at, spawn_q, spawn_r, joined_at, trophies, nutrients, biomass,
                  upgrades, queue, last_seen_at, updated_at)
           where players.id = t.id`,
          [
            id,
            worldId,
            ps.map((p) => p.id),
            ps.map((p) => p.heart.q),
            ps.map((p) => p.heart.r),
            ps.map((p) => toDate(p.heartMovedAt)),
            ps.map((p) => p.spawn.q),
            ps.map((p) => p.spawn.r),
            ps.map((p) => new Date(p.joinedAt)),
            ps.map((p) => p.trophies),
            ps.map((p) => p.nutrients),
            ps.map((p) => p.biomass),
            ps.map((p) => JSON.stringify(p.upgrades)),
            ps.map((p) => JSON.stringify(p.queue)),
            ps.map((p) => toDate(p.lastSeenAt)),
            ps.map((p) => new Date(p.updatedAt)),
          ],
        );
      }
      const tiles = [...forest.tiles.values()];
      await client.query(
        `update hex set terrain = t.terrain, owner_id = t.owner_id, growth_ends_at = t.growth_ends_at,
                growth_started_at = t.growth_started_at, exhaustion = t.exhaustion,
                disconnected_since = t.disconnected_since, capture_by = t.capture_by,
                capture_progress = t.capture_progress
         from unnest($2::int[], $3::int[], $4::text[], $5::uuid[], $6::timestamptz[], $7::timestamptz[],
                     $8::float8[], $9::timestamptz[], $10::uuid[], $11::float8[])
           as t(q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since,
                capture_by, capture_progress)
         where hex.world_id = $1 and hex.q = t.q and hex.r = t.r`,
        [
          worldId,
          tiles.map((t) => t.q),
          tiles.map((t) => t.r),
          tiles.map((t) => t.terrain),
          tiles.map((t) => t.owner),
          tiles.map((t) => toDate(t.growthEndsAt)),
          tiles.map((t) => toDate(t.growthStartedAt)),
          tiles.map((t) => t.exhaustion),
          tiles.map((t) => toDate(t.disconnectedSince)),
          tiles.map((t) => t.capture?.by ?? null),
          tiles.map((t) => t.capture?.progress ?? null),
        ],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}
