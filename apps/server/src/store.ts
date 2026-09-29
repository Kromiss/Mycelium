import {
  fromSnapshot,
  hexKey,
  normalizeUpgrades,
  TERRAIN_STATS,
  toSnapshot,
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

/** Where players and their games live. The server keeps active games in memory and saves them here. */
export interface GameStore {
  /** Creates a guest player with a new game. Throws NameTakenError if the name is used. */
  createGuest(name: string, tokenHash: string, game: GameState): Promise<PlayerInfo>;
  findPlayerByToken(tokenHash: string): Promise<PlayerInfo | null>;
  loadGame(playerId: string): Promise<GameState | null>;
  saveGame(playerId: string, game: GameState): Promise<void>;
}

/** In-process store, used when DATABASE_URL is not set (local dev) and in tests. Lost on restart. */
export class MemoryStore implements GameStore {
  private readonly players = new Map<string, PlayerInfo & { tokenHash: string }>();
  private readonly games = new Map<string, string>();

  async createGuest(name: string, tokenHash: string, game: GameState): Promise<PlayerInfo> {
    const lower = name.toLowerCase();
    for (const p of this.players.values()) if (p.name.toLowerCase() === lower) throw new NameTakenError();
    const player = { id: randomUUID(), name };
    this.players.set(player.id, { ...player, tokenHash });
    this.games.set(player.id, JSON.stringify(toSnapshot(game)));
    return player;
  }

  async findPlayerByToken(tokenHash: string): Promise<PlayerInfo | null> {
    for (const p of this.players.values()) if (p.tokenHash === tokenHash) return { id: p.id, name: p.name };
    return null;
  }

  async loadGame(playerId: string): Promise<GameState | null> {
    const raw = this.games.get(playerId);
    return raw ? fromSnapshot(JSON.parse(raw)) : null;
  }

  async saveGame(playerId: string, game: GameState): Promise<void> {
    this.games.set(playerId, JSON.stringify(toSnapshot(game)));
  }
}

interface PlayerRow {
  id: string;
  name: string;
  world_id: string;
  seed: string;
  radius: number;
  heart_q: number;
  heart_r: number;
  heart_moved_at: Date | null;
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
}

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const toMs = (d: Date | null) => (d === null ? null : d.getTime());

/** PostgreSQL store (tables from migrations 0001 to 0004). */
export class PgStore implements GameStore {
  constructor(private readonly pool: pg.Pool) {}

  async createGuest(name: string, tokenHash: string, game: GameState): Promise<PlayerInfo> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const taken = await client.query("select 1 from players where lower(name) = lower($1)", [name]);
      if (taken.rowCount) throw new NameTakenError();
      const world = await client.query<{ id: string }>(
        "insert into worlds (seed, radius) values ($1, $2) returning id",
        [game.seed, game.radius],
      );
      const worldId = world.rows[0]!.id;
      const player = await client.query<{ id: string }>(
        "insert into players (name, token_hash, world_id) values ($1, $2, $3) returning id",
        [name, tokenHash, worldId],
      );
      const playerId = player.rows[0]!.id;
      const tiles = [...game.tiles.values()];
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
      await writeGame(client, playerId, game);
      await client.query("commit");
      return { id: playerId, name };
    } catch (err) {
      await client.query("rollback");
      // Unique violation: another request took the name between the check and the insert.
      if ((err as { code?: string }).code === "23505") throw new NameTakenError();
      throw err;
    } finally {
      client.release();
    }
  }

  async findPlayerByToken(tokenHash: string): Promise<PlayerInfo | null> {
    const res = await this.pool.query<PlayerInfo>("select id, name from players where token_hash = $1", [tokenHash]);
    return res.rows[0] ?? null;
  }

  async loadGame(playerId: string): Promise<GameState | null> {
    const res = await this.pool.query<PlayerRow>(
      `select p.id, p.name, p.world_id, w.seed, w.radius, p.heart_q, p.heart_r, p.heart_moved_at, p.nutrients,
              p.biomass, p.upgrades, p.queue, p.last_seen_at, p.updated_at
       from players p join worlds w on w.id = p.world_id where p.id = $1`,
      [playerId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const hexes = await this.pool.query<HexRow>(
      `select q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since
       from hex where world_id = $1`,
      [row.world_id],
    );
    const tiles = new Map<string, Tile>();
    for (const h of hexes.rows) {
      const mine = h.owner_id === playerId;
      tiles.set(hexKey(h), {
        q: h.q,
        r: h.r,
        terrain: h.terrain,
        owned: mine,
        growthEndsAt: mine ? toMs(h.growth_ends_at) : null,
        growthStartedAt: mine && h.growth_ends_at ? toMs(h.growth_started_at) : null,
        exhaustion: h.exhaustion,
        disconnectedSince: mine ? toMs(h.disconnected_since) : null,
      });
    }
    const queue = Array.isArray(row.queue)
      ? row.queue.filter((h) => Number.isInteger(h?.q) && Number.isInteger(h?.r)).map((h) => ({ q: h.q, r: h.r }))
      : [];
    return {
      seed: Number(row.seed),
      radius: row.radius,
      heart: { q: row.heart_q, r: row.heart_r },
      heartMovedAt: toMs(row.heart_moved_at),
      nutrients: row.nutrients,
      biomass: row.biomass,
      upgrades: normalizeUpgrades(row.upgrades),
      queue,
      lastSeenAt: toMs(row.last_seen_at),
      tiles,
      updatedAt: row.updated_at.getTime(),
    };
  }

  async saveGame(playerId: string, game: GameState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await writeGame(client, playerId, game);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Writes the player's resources and every tile of their world (M2 changes tiles beyond ownership). */
async function writeGame(client: pg.PoolClient, playerId: string, game: GameState): Promise<void> {
  const res = await client.query<{ world_id: string }>(
    `update players set heart_q = $2, heart_r = $3, heart_moved_at = $4, nutrients = $5, biomass = $6,
            upgrades = $7, queue = $8, last_seen_at = $9, updated_at = $10
     where id = $1 returning world_id`,
    [
      playerId,
      game.heart.q,
      game.heart.r,
      toDate(game.heartMovedAt),
      game.nutrients,
      game.biomass,
      JSON.stringify(game.upgrades),
      JSON.stringify(game.queue),
      toDate(game.lastSeenAt),
      new Date(game.updatedAt),
    ],
  );
  const worldId = res.rows[0]?.world_id;
  if (!worldId) return;
  const tiles = [...game.tiles.values()];
  await client.query(
    `update hex set terrain = t.terrain, owner_id = t.owner_id, growth_ends_at = t.growth_ends_at,
            growth_started_at = t.growth_started_at, exhaustion = t.exhaustion,
            disconnected_since = t.disconnected_since
     from unnest($2::int[], $3::int[], $4::text[], $5::uuid[], $6::timestamptz[], $7::timestamptz[],
                 $8::float8[], $9::timestamptz[])
       as t(q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since)
     where hex.world_id = $1 and hex.q = t.q and hex.r = t.r`,
    [
      worldId,
      tiles.map((t) => t.q),
      tiles.map((t) => t.r),
      tiles.map((t) => t.terrain),
      tiles.map((t) => (t.owned ? playerId : null)),
      tiles.map((t) => toDate(t.growthEndsAt)),
      tiles.map((t) => toDate(t.growthStartedAt)),
      tiles.map((t) => t.exhaustion),
      tiles.map((t) => toDate(t.disconnectedSince)),
    ],
  );
}
