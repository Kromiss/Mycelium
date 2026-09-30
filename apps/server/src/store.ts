import {
  deserializeForest,
  forestSpawns,
  hexKey,
  isMutationId,
  isPushKind,
  isStrainId,
  isStructureId,
  normalizeAutomation,
  normalizeCooldowns,
  normalizeEffects,
  normalizeSporeUpgrades,
  normalizeUpgrades,
  refreshReservations,
  refreshToxins,
  seasonAt,
  serializeForest,
  TERRAIN_STATS,
  type ChatChannel,
  type ChatMessage,
  type ForestState,
  type PushKind,
  type PushLang,
  type GameState,
  type MutationId,
  type PlayerInfo,
  type SeasonResult,
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
  /** An admin cut the player's chat until then (ms), or null. */
  silencedUntil: number | null;
}

/** A chat message as stored: the pact it was sent to, if any. */
export interface StoredChat extends ChatMessage {
  pact: string | null;
}

export interface NewChat {
  forestId: string;
  channel: ChatChannel;
  pact: string | null;
  from: string;
  to: string | null;
  text: string;
  at: number;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  playerId: string;
  p256dh: string;
  auth: string;
  lang: PushLang;
  kinds: PushKind[];
}

export interface ForestRecord {
  id: string;
  /** Human-friendly number ("Forêt #12"). */
  number: number;
  /** Monday 00:00 Paris of the season (week) the forest belongs to. */
  seasonStart: number;
}

/** A player's final standing in a finished forest. */
export interface Standing {
  playerId: string;
  rank: number;
  players: number;
  biomass: number;
  trophies: number;
  tiles: number;
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
  /** Forests still being played (not ended). */
  listForests(): Promise<ForestRecord[]>;
  createForest(forest: ForestState, seasonStart: number): Promise<ForestRecord>;
  loadForest(id: string): Promise<LoadedForest | null>;
  /** Saves every player and tile of the forest (players who joined become members). */
  saveForest(id: string, forest: ForestState): Promise<void>;
  /** Ends a forest at the wipe: keeps its standings, releases its players. */
  endForest(id: string, standings: Standing[], endedAt: number): Promise<void>;
  /** A player's finished seasons, most recent first. */
  seasonHistory(playerId: string, limit: number): Promise<SeasonResult[]>;

  // Chat and moderation (M7)
  addChat(m: NewChat): Promise<StoredChat>;
  /** The forest's last `limit` messages (every channel), oldest first. */
  chatHistory(forestId: string, limit: number): Promise<StoredChat[]>;
  findChat(id: number): Promise<(StoredChat & { forestId: string }) | null>;
  reportChat(messageId: number, reporterId: string): Promise<void>;
  mutedBy(playerId: string): Promise<string[]>;
  setMute(playerId: string, mutedId: string, muted: boolean): Promise<void>;
  silence(playerId: string, until: number): Promise<void>;

  // Browser notifications (M7)
  savePushSubscription(sub: PushSubscriptionRecord): Promise<void>;
  /** Removes a subscription (only the player's own when `playerId` is given). */
  removePushSubscription(endpoint: string, playerId?: string): Promise<void>;
  pushSubscriptions(playerId: string): Promise<PushSubscriptionRecord[]>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

// ---------------------------------------------------------------------------

/** In-process store, used when DATABASE_URL is not set (local dev) and in tests. Lost on restart. */
export class MemoryStore implements GameStore {
  private readonly accounts = new Map<string, Account>();
  private readonly sessions = new Map<string, string>();
  private readonly forests = new Map<string, { record: ForestRecord; json: string; seed: number; ended: boolean }>();
  private readonly results: Array<Standing & { seasonStart: number; forestId: string }> = [];
  private readonly chats: Array<StoredChat & { forestId: string }> = [];
  private readonly reports = new Set<string>();
  private readonly mutes = new Map<string, Set<string>>();
  private readonly subscriptions = new Map<string, PushSubscriptionRecord>();
  private readonly settings = new Map<string, string>();
  private nextForest = 1;

  async createAccount(name: string, passwordHash: string | null, isBot = false): Promise<Account> {
    if (await this.findAccountByName(name)) throw new NameTakenError();
    const account: Account = { id: randomUUID(), name, passwordHash, isBot, silencedUntil: null };
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
    return [...this.forests.values()].filter((f) => !f.ended).map((f) => ({ ...f.record }));
  }

  async createForest(forest: ForestState, seasonStart: number): Promise<ForestRecord> {
    const record = { id: randomUUID(), number: this.nextForest++, seasonStart };
    this.forests.set(record.id, { record, json: JSON.stringify(serializeForest(forest)), seed: forest.seed, ended: false });
    return { ...record };
  }

  async endForest(id: string, standings: Standing[]): Promise<void> {
    const f = this.forests.get(id);
    if (!f || f.ended) return;
    f.ended = true;
    for (const st of standings) this.results.push({ ...st, seasonStart: f.record.seasonStart, forestId: id });
  }

  async seasonHistory(playerId: string, limit: number): Promise<SeasonResult[]> {
    return this.results
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => b.seasonStart - a.seasonStart)
      .slice(0, limit)
      .map((r) => {
        const f = this.forests.get(r.forestId)!;
        return toResult(r.seasonStart, f.record.number, f.seed, r);
      });
  }

  async loadForest(id: string): Promise<LoadedForest | null> {
    const f = this.forests.get(id);
    if (!f || f.ended) return null;
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

  async addChat(m: NewChat): Promise<StoredChat> {
    const stored: StoredChat & { forestId: string } = {
      id: this.chats.length + 1,
      forestId: m.forestId,
      channel: m.channel,
      pact: m.pact,
      from: m.from,
      fromName: this.accounts.get(m.from)?.name ?? "?",
      ...(m.to ? { to: m.to } : {}),
      at: m.at,
      text: m.text,
    };
    this.chats.push(stored);
    return withoutForest(stored);
  }

  async chatHistory(forestId: string, limit: number): Promise<StoredChat[]> {
    return this.chats.filter((c) => c.forestId === forestId).slice(-limit).map(withoutForest);
  }

  async findChat(id: number): Promise<(StoredChat & { forestId: string }) | null> {
    const c = this.chats[id - 1];
    return c ? { ...c } : null;
  }

  async reportChat(messageId: number, reporterId: string): Promise<void> {
    this.reports.add(`${messageId}|${reporterId}`);
  }

  /** For tests. */
  reportCount(): number {
    return this.reports.size;
  }

  async mutedBy(playerId: string): Promise<string[]> {
    return [...(this.mutes.get(playerId) ?? [])];
  }

  async setMute(playerId: string, mutedId: string, muted: boolean): Promise<void> {
    const set = this.mutes.get(playerId) ?? new Set<string>();
    if (muted) set.add(mutedId);
    else set.delete(mutedId);
    this.mutes.set(playerId, set);
  }

  async silence(playerId: string, until: number): Promise<void> {
    const a = this.accounts.get(playerId);
    if (a) a.silencedUntil = until;
  }

  async savePushSubscription(sub: PushSubscriptionRecord): Promise<void> {
    this.subscriptions.set(sub.endpoint, { ...sub, kinds: [...sub.kinds] });
  }

  async removePushSubscription(endpoint: string, playerId?: string): Promise<void> {
    const sub = this.subscriptions.get(endpoint);
    if (sub && (playerId === undefined || sub.playerId === playerId)) this.subscriptions.delete(endpoint);
  }

  async pushSubscriptions(playerId: string): Promise<PushSubscriptionRecord[]> {
    return [...this.subscriptions.values()].filter((s) => s.playerId === playerId).map((s) => ({ ...s, kinds: [...s.kinds] }));
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}

function withoutForest(c: StoredChat & { forestId: string }): StoredChat {
  const { forestId: _forest, ...rest } = c;
  return rest;
}

// ---------------------------------------------------------------------------

interface AccountRow {
  id: string;
  name: string;
  password_hash: string | null;
  is_bot: boolean;
  chat_silenced_until: Date | null;
}

interface ChatRow {
  id: string;
  forest_id: string;
  channel: ChatChannel;
  pact_id: string | null;
  from_id: string;
  from_name: string;
  to_id: string | null;
  body: string;
  sent_at: Date;
}

const toChat = (r: ChatRow): StoredChat => ({
  id: Number(r.id),
  channel: r.channel,
  pact: r.pact_id,
  from: r.from_id,
  fromName: r.from_name,
  ...(r.to_id ? { to: r.to_id } : {}),
  at: r.sent_at.getTime(),
  text: r.body,
});

const ACCOUNT_COLUMNS = "id, name, password_hash, is_bot, chat_silenced_until";

interface PlayerRow extends AccountRow {
  heart_q: number;
  heart_r: number;
  heart_moved_at: Date | null;
  spawn_q: number;
  spawn_r: number;
  joined_at: Date;
  trophies: number;
  monday_bonus: number;
  nutrients: number;
  enzymes: number;
  enzymes_unlocked: boolean;
  strain: string | null;
  mutations: unknown;
  spores: number;
  spore_upgrades: unknown;
  fruitings: number;
  automation: unknown;
  cooldowns: unknown;
  heart_shield_until: Date | null;
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
  structure: string | null;
  effects: unknown;
}

function toResult(
  seasonStart: number,
  forestNumber: number,
  seed: number,
  r: Pick<Standing, "rank" | "players" | "biomass" | "trophies" | "tiles">,
): SeasonResult {
  const { week, year } = seasonAt(seasonStart);
  return {
    seasonStart,
    week,
    year,
    forestNumber,
    rank: r.rank,
    players: r.players,
    biomass: r.biomass,
    trophies: r.trophies,
    tiles: r.tiles,
    seed,
  };
}

const toDate = (ms: number | null) => (ms === null ? null : new Date(ms));
const toMs = (d: Date | null) => (d === null ? null : d.getTime());
const toAccount = (r: AccountRow): Account => ({
  id: r.id,
  name: r.name,
  passwordHash: r.password_hash,
  isBot: r.is_bot,
  silencedUntil: toMs(r.chat_silenced_until ?? null),
});

/** PostgreSQL store (tables from migrations 0001 to 0005). */
export class PgStore implements GameStore {
  constructor(private readonly pool: pg.Pool) {}

  async createAccount(name: string, passwordHash: string | null, isBot = false): Promise<Account> {
    try {
      const res = await this.pool.query<AccountRow>(
        `insert into players (name, password_hash, is_bot)
         select $1, $2, $3 where not exists (select 1 from players where lower(name) = lower($1))
         returning ${ACCOUNT_COLUMNS}`,
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
      `select ${ACCOUNT_COLUMNS} from players where lower(name) = lower($1)`,
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
       select p.id, p.name, p.password_hash, p.is_bot, p.chat_silenced_until from players p
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
    const res = await this.pool.query<{ id: string; number: number; season_start: Date }>(
      "select id, number, season_start from forests where ended_at is null order by number",
    );
    return res.rows.map((r) => ({ id: r.id, number: r.number, seasonStart: r.season_start.getTime() }));
  }

  async endForest(id: string, standings: Standing[], endedAt: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const res = await client.query<{ season_start: Date }>(
        "update forests set ended_at = $2 where id = $1 and ended_at is null returning season_start",
        [id, new Date(endedAt)],
      );
      if (res.rows[0]) {
        await client.query(
          `insert into season_results (season_start, player_id, forest_id, rank, players, biomass, trophies, tiles)
           select $1, t.player_id, $2, t.rank, t.players, t.biomass, t.trophies, t.tiles
           from unnest($3::uuid[], $4::int[], $5::int[], $6::float8[], $7::int[], $8::int[])
             as t(player_id, rank, players, biomass, trophies, tiles)
           on conflict do nothing`,
          [
            res.rows[0].season_start,
            id,
            standings.map((s) => s.playerId),
            standings.map((s) => s.rank),
            standings.map((s) => s.players),
            standings.map((s) => s.biomass),
            standings.map((s) => s.trophies),
            standings.map((s) => s.tiles),
          ],
        );
        await client.query("update players set forest_id = null where forest_id = $1", [id]);
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async seasonHistory(playerId: string, limit: number): Promise<SeasonResult[]> {
    const res = await this.pool.query<{
      season_start: Date;
      rank: number;
      players: number;
      biomass: number;
      trophies: number;
      tiles: number;
      number: number;
      seed: string;
    }>(
      `select r.season_start, r.rank, r.players, r.biomass, r.trophies, r.tiles, f.number, w.seed
       from season_results r join forests f on f.id = r.forest_id join worlds w on w.id = f.world_id
       where r.player_id = $1 order by r.season_start desc limit $2`,
      [playerId, limit],
    );
    return res.rows.map((r) => toResult(r.season_start.getTime(), r.number, Number(r.seed), r));
  }

  async createForest(forest: ForestState, seasonStart: number): Promise<ForestRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const world = await client.query<{ id: string }>(
        "insert into worlds (seed, radius, layout, capacity) values ($1, $2, 'forest', $3) returning id",
        [forest.seed, forest.radius, forest.layout.capacity],
      );
      const worldId = world.rows[0]!.id;
      const rec = await client.query<{ id: string; number: number }>(
        "insert into forests (world_id, updated_at, season_start) values ($1, $2, $3) returning id, number",
        [worldId, new Date(forest.updatedAt), new Date(seasonStart)],
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
      return { ...rec.rows[0]!, seasonStart };
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
      season_start: Date;
      events: unknown;
    }>(
      `select f.id, f.number, f.world_id, w.seed, w.radius, w.capacity, f.updated_at, f.season_start, f.events
       from forests f join worlds w on w.id = f.world_id where f.id = $1 and f.ended_at is null`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    const hexes = await this.pool.query<HexRow>(
      `select q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since,
              capture_by, capture_progress, structure, effects
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
        structure: h.structure !== null && isStructureId(h.structure) ? h.structure : null,
        toxic: false,
        effects: normalizeEffects(h.effects),
      });
    }
    const layout = { kind: "forest", capacity: row.capacity } as const;
    const seed = Number(row.seed);
    const players = await this.pool.query<PlayerRow>(
      `select id, name, password_hash, is_bot, chat_silenced_until, heart_q, heart_r, heart_moved_at, spawn_q, spawn_r, joined_at, trophies,
              monday_bonus, nutrients, enzymes, enzymes_unlocked, strain, mutations, spores, spore_upgrades, fruitings,
              automation, cooldowns, heart_shield_until, biomass, upgrades, queue, last_seen_at, updated_at
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
        calendar: true,
        mondayBonus: p.monday_bonus,
        strain: p.strain !== null && isStrainId(p.strain) ? p.strain : null,
        mutations: Array.isArray(p.mutations) ? p.mutations.filter((m): m is MutationId => typeof m === "string" && isMutationId(m)) : [],
        spores: p.spores,
        sporeUpgrades: normalizeSporeUpgrades(p.spore_upgrades),
        fruitings: p.fruitings,
        automation: normalizeAutomation(p.automation),
        heart: { q: p.heart_q, r: p.heart_r },
        heartMovedAt: toMs(p.heart_moved_at),
        heartShieldUntil: toMs(p.heart_shield_until),
        cooldowns: normalizeCooldowns(p.cooldowns),
        siphoned: {},
        nutrients: p.nutrients,
        enzymes: p.enzymes,
        enzymesUnlocked: p.enzymes_unlocked,
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
      calendar: true,
      events: Array.isArray(row.events) ? (row.events as ForestState["events"]) : [],
      updatedAt: row.updated_at.getTime(),
    };
    refreshReservations(forest, forest.updatedAt);
    refreshToxins(forest);
    return { record: { id: row.id, number: row.number, seasonStart: row.season_start.getTime() }, forest, members };
  }

  async saveForest(id: string, forest: ForestState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const res = await client.query<{ world_id: string }>(
        "update forests set updated_at = $2, events = $3::jsonb where id = $1 returning world_id",
        [id, new Date(forest.updatedAt), JSON.stringify(forest.events)],
      );
      const worldId = res.rows[0]?.world_id;
      if (!worldId) throw new Error(`Unknown forest ${id}`);
      const ps = [...forest.players.values()];
      if (ps.length > 0) {
        await client.query(
          `update players set forest_id = $1, world_id = $2, heart_q = t.heart_q, heart_r = t.heart_r,
                  heart_moved_at = t.heart_moved_at, spawn_q = t.spawn_q, spawn_r = t.spawn_r, joined_at = t.joined_at,
                  trophies = t.trophies, nutrients = t.nutrients, biomass = t.biomass, upgrades = t.upgrades::jsonb,
                  queue = t.queue::jsonb, last_seen_at = t.last_seen_at, updated_at = t.updated_at,
                  monday_bonus = t.monday_bonus, enzymes = t.enzymes, enzymes_unlocked = t.enzymes_unlocked,
                  strain = t.strain, mutations = t.mutations::jsonb, spores = t.spores,
                  spore_upgrades = t.spore_upgrades::jsonb, fruitings = t.fruitings, automation = t.automation::jsonb,
                  cooldowns = t.cooldowns::jsonb, heart_shield_until = t.heart_shield_until
           from unnest($3::uuid[], $4::int[], $5::int[], $6::timestamptz[], $7::int[], $8::int[], $9::timestamptz[],
                       $10::int[], $11::float8[], $12::float8[], $13::text[], $14::text[], $15::timestamptz[],
                       $16::timestamptz[], $17::float8[], $18::float8[], $19::bool[], $20::text[], $21::text[],
                       $22::float8[], $23::text[], $24::int[], $25::text[], $26::text[], $27::timestamptz[])
             as t(id, heart_q, heart_r, heart_moved_at, spawn_q, spawn_r, joined_at, trophies, nutrients, biomass,
                  upgrades, queue, last_seen_at, updated_at, monday_bonus, enzymes, enzymes_unlocked, strain, mutations,
                  spores, spore_upgrades, fruitings, automation, cooldowns, heart_shield_until)
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
            ps.map((p) => p.mondayBonus),
            ps.map((p) => p.enzymes),
            ps.map((p) => p.enzymesUnlocked),
            ps.map((p) => p.strain),
            ps.map((p) => JSON.stringify(p.mutations)),
            ps.map((p) => p.spores),
            ps.map((p) => JSON.stringify(p.sporeUpgrades)),
            ps.map((p) => p.fruitings),
            ps.map((p) => JSON.stringify(p.automation)),
            ps.map((p) => JSON.stringify(p.cooldowns)),
            ps.map((p) => toDate(p.heartShieldUntil)),
          ],
        );
      }
      const tiles = [...forest.tiles.values()];
      await client.query(
        `update hex set terrain = t.terrain, owner_id = t.owner_id, growth_ends_at = t.growth_ends_at,
                growth_started_at = t.growth_started_at, exhaustion = t.exhaustion,
                disconnected_since = t.disconnected_since, capture_by = t.capture_by,
                capture_progress = t.capture_progress, structure = t.structure, effects = t.effects::jsonb
         from unnest($2::int[], $3::int[], $4::text[], $5::uuid[], $6::timestamptz[], $7::timestamptz[],
                     $8::float8[], $9::timestamptz[], $10::uuid[], $11::float8[], $12::text[], $13::text[])
           as t(q, r, terrain, owner_id, growth_ends_at, growth_started_at, exhaustion, disconnected_since,
                capture_by, capture_progress, structure, effects)
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
          tiles.map((t) => t.structure),
          tiles.map((t) => JSON.stringify(t.effects)),
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

  async addChat(m: NewChat): Promise<StoredChat> {
    const res = await this.pool.query<ChatRow>(
      `with c as (
         insert into chat_messages (forest_id, channel, pact_id, from_id, to_id, body, sent_at)
         values ($1, $2, $3, $4, $5, $6, $7) returning *
       )
       select c.*, p.name as from_name from c join players p on p.id = c.from_id`,
      [m.forestId, m.channel, m.pact, m.from, m.to, m.text, new Date(m.at)],
    );
    return toChat(res.rows[0]!);
  }

  async chatHistory(forestId: string, limit: number): Promise<StoredChat[]> {
    const res = await this.pool.query<ChatRow>(
      `select c.*, p.name as from_name from chat_messages c join players p on p.id = c.from_id
       where c.forest_id = $1 order by c.id desc limit $2`,
      [forestId, limit],
    );
    return res.rows.reverse().map(toChat);
  }

  async findChat(id: number): Promise<(StoredChat & { forestId: string }) | null> {
    const res = await this.pool.query<ChatRow>(
      "select c.*, p.name as from_name from chat_messages c join players p on p.id = c.from_id where c.id = $1",
      [id],
    );
    const row = res.rows[0];
    return row ? { ...toChat(row), forestId: row.forest_id } : null;
  }

  async reportChat(messageId: number, reporterId: string): Promise<void> {
    await this.pool.query("insert into chat_reports (message_id, reporter_id) values ($1, $2) on conflict do nothing", [messageId, reporterId]);
  }

  async mutedBy(playerId: string): Promise<string[]> {
    const res = await this.pool.query<{ muted_id: string }>("select muted_id from chat_mutes where player_id = $1", [playerId]);
    return res.rows.map((r) => r.muted_id);
  }

  async setMute(playerId: string, mutedId: string, muted: boolean): Promise<void> {
    if (muted) {
      await this.pool.query("insert into chat_mutes (player_id, muted_id) values ($1, $2) on conflict do nothing", [playerId, mutedId]);
    } else {
      await this.pool.query("delete from chat_mutes where player_id = $1 and muted_id = $2", [playerId, mutedId]);
    }
  }

  async silence(playerId: string, until: number): Promise<void> {
    await this.pool.query("update players set chat_silenced_until = $2 where id = $1", [playerId, new Date(until)]);
  }

  async savePushSubscription(sub: PushSubscriptionRecord): Promise<void> {
    await this.pool.query(
      `insert into push_subscriptions (endpoint, player_id, p256dh, auth, lang, kinds) values ($1, $2, $3, $4, $5, $6::jsonb)
       on conflict (endpoint) do update set player_id = $2, p256dh = $3, auth = $4, lang = $5, kinds = $6::jsonb`,
      [sub.endpoint, sub.playerId, sub.p256dh, sub.auth, sub.lang, JSON.stringify(sub.kinds)],
    );
  }

  async removePushSubscription(endpoint: string, playerId?: string): Promise<void> {
    if (playerId === undefined) await this.pool.query("delete from push_subscriptions where endpoint = $1", [endpoint]);
    else await this.pool.query("delete from push_subscriptions where endpoint = $1 and player_id = $2", [endpoint, playerId]);
  }

  async pushSubscriptions(playerId: string): Promise<PushSubscriptionRecord[]> {
    const res = await this.pool.query<{ endpoint: string; player_id: string; p256dh: string; auth: string; lang: string; kinds: unknown }>(
      "select endpoint, player_id, p256dh, auth, lang, kinds from push_subscriptions where player_id = $1",
      [playerId],
    );
    return res.rows.map((r) => ({
      endpoint: r.endpoint,
      playerId: r.player_id,
      p256dh: r.p256dh,
      auth: r.auth,
      lang: r.lang === "fr" ? "fr" : "en",
      kinds: Array.isArray(r.kinds) ? r.kinds.filter(isPushKind) : [],
    }));
  }

  async getSetting(key: string): Promise<string | null> {
    const res = await this.pool.query<{ value: string }>("select value from server_settings where key = $1", [key]);
    return res.rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.pool.query(
      "insert into server_settings (key, value) values ($1, $2) on conflict (key) do update set value = $2",
      [key, value],
    );
  }
}
