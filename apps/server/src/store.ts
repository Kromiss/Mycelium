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
  nutrients: number;
  biomass: number;
  upgrades: Record<string, number>;
  updated_at: Date;
}

interface HexRow {
  q: number;
  r: number;
  terrain: Terrain;
  owner_id: string | null;
  growth_ends_at: Date | null;
  growth_started_at: Date | null;
}

/** PostgreSQL store (tables from migrations 0001 and 0002). */
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
        `insert into players (name, token_hash, world_id, heart_q, heart_r, nutrients, biomass, upgrades, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          name,
          tokenHash,
          worldId,
          game.heart.q,
          game.heart.r,
          game.nutrients,
          game.biomass,
          JSON.stringify(game.upgrades),
          new Date(game.updatedAt),
        ],
      );
      const playerId = player.rows[0]!.id;
      const tiles = [...game.tiles.values()];
      await client.query(
        `insert into hex (world_id, q, r, terrain, owner_id, reserve, growth_ends_at)
         select $1, t.q, t.r, t.terrain, t.owner_id, t.reserve, t.growth_ends_at
         from unnest($2::int[], $3::int[], $4::text[], $5::uuid[], $6::float8[], $7::timestamptz[])
           as t(q, r, terrain, owner_id, reserve, growth_ends_at)`,
        [
          worldId,
          tiles.map((t) => t.q),
          tiles.map((t) => t.r),
          tiles.map((t) => t.terrain),
          tiles.map((t) => (t.owned ? playerId : null)),
          tiles.map((t) => TERRAIN_STATS[t.terrain].reserve),
          tiles.map((t) => (t.growthEndsAt === null ? null : new Date(t.growthEndsAt))),
        ],
      );
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
      `select p.id, p.name, p.world_id, w.seed, w.radius, p.heart_q, p.heart_r, p.nutrients, p.biomass,
              p.upgrades, p.updated_at
       from players p join worlds w on w.id = p.world_id where p.id = $1`,
      [playerId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const hexes = await this.pool.query<HexRow>(
      "select q, r, terrain, owner_id, growth_ends_at, growth_started_at from hex where world_id = $1",
      [row.world_id],
    );
    const tiles = new Map<string, Tile>();
    for (const h of hexes.rows) {
      tiles.set(hexKey(h), {
        q: h.q,
        r: h.r,
        terrain: h.terrain,
        owned: h.owner_id === playerId,
        growthEndsAt: h.owner_id === playerId && h.growth_ends_at ? h.growth_ends_at.getTime() : null,
        growthStartedAt:
          h.owner_id === playerId && h.growth_ends_at && h.growth_started_at ? h.growth_started_at.getTime() : null,
      });
    }
    return {
      seed: Number(row.seed),
      radius: row.radius,
      heart: { q: row.heart_q, r: row.heart_r },
      nutrients: row.nutrients,
      biomass: row.biomass,
      upgrades: normalizeUpgrades(row.upgrades),
      tiles,
      updatedAt: row.updated_at.getTime(),
    };
  }

  async saveGame(playerId: string, game: GameState): Promise<void> {
    const owned = [...game.tiles.values()].filter((t) => t.owned);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const res = await client.query<{ world_id: string }>(
        `update players set nutrients = $2, biomass = $3, upgrades = $4, updated_at = $5
         where id = $1 returning world_id`,
        [playerId, game.nutrients, game.biomass, JSON.stringify(game.upgrades), new Date(game.updatedAt)],
      );
      const worldId = res.rows[0]?.world_id;
      if (worldId) {
        // Tiles are never lost in M1, so updating the owned ones is enough.
        await client.query(
          `update hex set owner_id = $2, growth_ends_at = t.growth_ends_at, growth_started_at = t.growth_started_at
           from unnest($3::int[], $4::int[], $5::timestamptz[], $6::timestamptz[])
             as t(q, r, growth_ends_at, growth_started_at)
           where hex.world_id = $1 and hex.q = t.q and hex.r = t.r`,
          [
            worldId,
            playerId,
            owned.map((t) => t.q),
            owned.map((t) => t.r),
            owned.map((t) => (t.growthEndsAt === null ? null : new Date(t.growthEndsAt))),
            owned.map((t) => (t.growthStartedAt === null ? null : new Date(t.growthStartedAt))),
          ],
        );
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}
