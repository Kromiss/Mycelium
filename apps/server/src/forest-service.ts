import {
  advance,
  advanceForest,
  botPlay,
  buyUpgrade,
  colonize,
  conversionRate,
  FOREST,
  freeSlices,
  goOffline,
  goOnline,
  isValidPassword,
  isValidPlayerName,
  joinForest,
  mondayBonusFor,
  moveHeart,
  newForest,
  randomSeed,
  resolveBorders,
  seasonAt,
  TICK_MS,
  toSnapshot,
  unqueue,
  visibleKeys,
  type ActionResult,
  type AuthError,
  type AwaySummary,
  type CaptureNotice,
  type ForestState,
  type GameState,
  type Leaderboard,
  type LeaderboardEntry,
  type OwnerInfo,
  type SeasonResult,
  type ServerMessage,
  type SessionResponse,
} from "@mycelium/shared";
import { hashPassword, hashToken, newToken, RateLimiter, verifyPassword } from "./auth";
import { MemoryScoreBoard, type ScoreBoard } from "./leaderboard";
import { NameTakenError, type Account, type ForestRecord, type GameStore, type Standing } from "./store";

/** Anything we can push server messages to (a WebSocket in production, a spy in tests). */
export interface GameClient {
  send(msg: ServerMessage): void;
}

export type AuthResult = { ok: true; session: SessionResponse } | { ok: false; error: AuthError };

export interface ForestServiceOptions {
  scores?: ScoreBoard;
  /** Real clock (ms). */
  now?: () => number;
  /** Game time runs this many times faster than real time (local testing only). */
  timeScale?: number;
  /** Robots added to the first forest (local testing, GDD M3 "tester avec des robots"). */
  bots?: number;
  /** Players per new forest. */
  capacity?: number;
  log?: (msg: string) => void;
}

interface AwayMark {
  biomass: number;
  tiles: number;
  won: number;
  lost: number;
}

interface LiveForest {
  record: ForestRecord;
  forest: ForestState;
  members: Map<string, Account>;
  clients: Map<string, Set<GameClient>>;
  /** Tiles won / lost per player since the server started (for the absence summary). */
  won: Map<string, number>;
  lost: Map<string, number>;
  away: Map<string, AwayMark>;
  saving: Promise<void>;
}

const SAVE_EVERY_TICKS = 3;
const HISTORY_SIZE = 5;
const BOT_SESSION_MS = 6 * 3_600_000;

/**
 * Authoritative simulation of every forest (GDD §12). All forests live in memory: every player's
 * economy runs whether they are connected or not, borders are resolved on each tick, connected
 * clients get their view of the forest (fog) and the leaderboard, and forests are saved regularly.
 */
export class ForestService {
  private readonly forests = new Map<string, LiveForest>();
  private readonly playerForest = new Map<string, string>();
  private readonly scores: ScoreBoard;
  private readonly realNow: () => number;
  private readonly timeScale: number;
  private readonly capacity: number;
  private readonly bots: number;
  private readonly log: (msg: string) => void;
  private readonly logins = new RateLimiter(10, 15 * 60_000);
  private timer: NodeJS.Timeout | undefined;
  private clockBase = 0;
  private realBase = 0;
  private ticks = 0;
  private lastTick = 0;
  private creating: Promise<LiveForest> | null = null;

  constructor(
    private readonly store: GameStore,
    options: ForestServiceOptions = {},
  ) {
    this.scores = options.scores ?? new MemoryScoreBoard();
    this.realNow = options.now ?? Date.now;
    this.timeScale = Math.max(1, options.timeScale ?? 1);
    this.capacity = options.capacity ?? FOREST.capacity;
    this.bots = options.bots ?? 0;
    this.log = options.log ?? ((msg) => console.error(`[forest] ${msg}`));
    this.realBase = this.realNow();
    this.clockBase = this.realBase;
  }

  /** Game clock: real time, sped up by `timeScale` in local testing. */
  now(): number {
    return this.clockBase + (this.realNow() - this.realBase) * this.timeScale;
  }

  /** Loads every forest, ends those whose season is over, adds the robots, and starts ticking. */
  async start(options: { tick?: boolean } = {}): Promise<void> {
    for (const record of await this.store.listForests()) {
      const loaded = await this.store.loadForest(record.id);
      if (loaded) this.adopt(loaded.record, loaded.forest, loaded.members);
    }
    // A sped-up clock must never run behind what was already simulated.
    const latest = Math.max(this.realNow(), ...[...this.forests.values()].map((f) => f.forest.updatedAt));
    this.clockBase = latest;
    this.realBase = this.realNow();
    this.lastTick = this.now();
    await this.rollSeasons(this.now());
    if (this.bots > 0) await this.addBots(this.bots);
    if (options.tick !== false) {
      const period = Math.max(250, TICK_MS / Math.min(this.timeScale, 20));
      this.timer = setInterval(() => void this.tick(), period);
    }
  }

  /** Stops ticking and saves everything; connected players count as gone from now. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    const now = this.now();
    for (const live of this.forests.values()) {
      advanceForest(live.forest, now);
      for (const [id, clients] of live.clients) if (clients.size > 0) goOffline(live.forest.players.get(id)!, now);
      this.save(live);
    }
    await Promise.all([...this.forests.values()].map((f) => f.saving));
  }

  // -------------------------------------------------------------------------
  // Accounts (pseudo + password, decided for M3)

  async register(rawName: string, password: string): Promise<AuthResult> {
    const name = rawName.trim();
    if (!isValidPlayerName(name)) return { ok: false, error: "invalid_name" };
    if (!isValidPassword(password)) return { ok: false, error: "weak_password" };
    try {
      const account = await this.store.createAccount(name, await hashPassword(password));
      return { ok: true, session: await this.openSession(account) };
    } catch (err) {
      if (err instanceof NameTakenError) return { ok: false, error: "name_taken" };
      throw err;
    }
  }

  async login(rawName: string, password: string, from = ""): Promise<AuthResult> {
    const name = rawName.trim();
    if (!this.logins.allow(`${name.toLowerCase()}|${from}`) || !this.logins.allow(`ip|${from}`)) {
      return { ok: false, error: "too_many_attempts" };
    }
    const account = await this.store.findAccountByName(name);
    if (!account?.passwordHash || !(await verifyPassword(password, account.passwordHash))) {
      return { ok: false, error: "wrong_credentials" };
    }
    return { ok: true, session: await this.openSession(account) };
  }

  /** Lets an M1–M2 guest (no password yet) secure their account. */
  async setPassword(token: string, password: string): Promise<"ok" | "unauthorized" | "weak_password" | "already_set"> {
    const account = await this.authenticate(token);
    if (!account) return "unauthorized";
    if (account.passwordHash) return "already_set";
    if (!isValidPassword(password)) return "weak_password";
    await this.store.setPassword(account.id, await hashPassword(password));
    return "ok";
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(hashToken(token));
  }

  async authenticate(token: string): Promise<Account | null> {
    const account = await this.store.findAccountBySession(hashToken(token));
    return account && !account.isBot ? account : null;
  }

  private async openSession(account: Account): Promise<SessionResponse> {
    const token = newToken();
    await this.store.createSession(account.id, hashToken(token));
    return { token, player: { id: account.id, name: account.name } };
  }

  // -------------------------------------------------------------------------
  // Playing

  /** Puts the player in their forest (joining one if needed) and sends them the game. */
  async attach(account: Account, client: GameClient): Promise<boolean> {
    const live = await this.forestOf(account);
    if (!live) return false;
    const now = this.now();
    advanceForest(live.forest, now);
    const player = live.forest.players.get(account.id)!;
    const clients = live.clients.get(account.id) ?? new Set();
    live.clients.set(account.id, clients);
    let away: AwaySummary | undefined;
    if (clients.size === 0) {
      away = this.comeBack(live, player, now);
      goOnline(player, now);
    }
    clients.add(client);
    const { game, owners } = this.view(live, player);
    client.send({
      type: "ready",
      player: { id: account.id, name: account.name },
      forest: {
        id: live.record.id,
        number: live.record.number,
        capacity: live.forest.layout.capacity,
        players: live.forest.players.size,
        seasonStart: live.record.seasonStart,
      },
      game,
      owners,
      serverTime: now,
      timeScale: this.timeScale,
      away,
      needsPassword: account.passwordHash === null,
      history: await this.store.seasonHistory(account.id, HISTORY_SIZE),
    });
    client.send({ type: "leaderboard", leaderboard: await this.leaderboard(live, account.id) });
    return true;
  }

  async detach(playerId: string, client: GameClient): Promise<void> {
    const live = this.liveOf(playerId);
    const clients = live?.clients.get(playerId);
    if (!live || !clients?.delete(client) || clients.size > 0) return;
    const now = this.now();
    advanceForest(live.forest, now);
    const player = live.forest.players.get(playerId)!;
    goOffline(player, now);
    live.away.set(playerId, {
      biomass: player.biomass,
      tiles: countTiles(live.forest, playerId),
      won: live.won.get(playerId) ?? 0,
      lost: live.lost.get(playerId) ?? 0,
    });
    this.save(live);
    await live.saving;
  }

  colonize(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (p, now) => colonize(p, { q, r }, now));
  }

  unqueue(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (p) => unqueue(p, { q, r }));
  }

  moveHeart(playerId: string, q: number, r: number, client: GameClient): void {
    this.act(playerId, client, (p, now) => moveHeart(p, { q, r }, now));
  }

  buyUpgrade(playerId: string, upgrade: string, client: GameClient): void {
    this.act(playerId, client, (p) => buyUpgrade(p, upgrade));
  }

  /** One simulation step for every forest: economy, borders, robots, views, leaderboard, saves. */
  async tick(): Promise<void> {
    const now = this.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.ticks++;
    if (await this.rollSeasons(now)) {
      if (this.bots > 0) await this.addBots(this.bots);
    }
    await Promise.all(
      [...this.forests.values()].map(async (live) => {
        advanceForest(live.forest, now);
        const events = resolveBorders(live.forest, dt, now);
        const notices = new Map<string, CaptureNotice[]>();
        for (const e of events) {
          live.won.set(e.to, (live.won.get(e.to) ?? 0) + 1);
          live.lost.set(e.from, (live.lost.get(e.from) ?? 0) + 1);
          push(notices, e.to, { q: e.q, r: e.r, kind: "won", other: e.from });
          push(notices, e.from, { q: e.q, r: e.r, kind: "lost", other: e.to });
        }
        for (const [id, account] of live.members) {
          if (account.isBot) botPlay(live.forest.players.get(id)!, now, Math.floor(now / BOT_SESSION_MS) !== Math.floor((now - dt) / BOT_SESSION_MS));
        }
        await this.scores.publish(
          live.record.seasonStart,
          live.record.id,
          [...live.forest.players.values()].map((p) => [p.id, p.biomass] as const),
        );
        for (const [id, clients] of live.clients) {
          if (clients.size === 0) continue;
          const player = live.forest.players.get(id)!;
          const { game, owners } = this.view(live, player);
          const board = await this.leaderboard(live, id);
          for (const c of clients) {
            c.send({ type: "state", game, owners, serverTime: now, events: notices.get(id) ?? [] });
            c.send({ type: "leaderboard", leaderboard: board });
          }
        }
        if (this.ticks % SAVE_EVERY_TICKS === 0) this.save(live);
      }),
    );
  }

  /** For tests and diagnostics. */
  forestState(playerId: string): ForestState | undefined {
    return this.liveOf(playerId)?.forest;
  }

  // -------------------------------------------------------------------------

  private act(playerId: string, client: GameClient, action: (p: GameState, now: number) => ActionResult): void {
    const live = this.liveOf(playerId);
    if (!live || !live.clients.get(playerId)?.has(client)) {
      client.send({ type: "actionError", error: "not_authenticated" });
      return;
    }
    const now = this.now();
    advanceForest(live.forest, now);
    const player = live.forest.players.get(playerId)!;
    const result = action(player, now);
    if (!result.ok) {
      client.send({ type: "actionError", error: result.error });
      return;
    }
    advance(player, now);
    const { game, owners } = this.view(live, player);
    for (const c of live.clients.get(playerId)!) c.send({ type: "state", game, owners, serverTime: now, events: [] });
  }

  /** What a player sees: their game, the tiles near their network, and who owns them. */
  private view(live: LiveForest, player: GameState): { game: ReturnType<typeof toSnapshot>; owners: OwnerInfo[] } {
    const visible = visibleKeys(live.forest, player.id);
    const game = toSnapshot(player, visible);
    const ids = new Set<string>([player.id]);
    for (const t of game.tiles) {
      if (t.owner) ids.add(t.owner);
      if (t.capture) ids.add(t.capture.by);
    }
    return { game, owners: [...ids].map((id) => this.ownerInfo(live, id)) };
  }

  private ownerInfo(live: LiveForest, id: string): OwnerInfo {
    const p = live.forest.players.get(id);
    const slice = p ? live.forest.spawns.findIndex((s) => s.q === p.spawn.q && s.r === p.spawn.r) : 0;
    return { id, name: live.members.get(id)?.name ?? "?", color: Math.max(0, slice) };
  }

  private async leaderboard(live: LiveForest, playerId: string): Promise<Leaderboard> {
    const ranked = this.ranking(live);
    const me = ranked.findIndex((e) => e.id === playerId);
    return {
      top: ranked.slice(0, 10),
      around: ranked.slice(Math.max(0, me - 2), me + 3),
      rank: me + 1,
      players: ranked.length,
      global: await this.scores.globalRank(live.record.seasonStart, playerId),
    };
  }

  /** Forest ranking by cumulated biomass (GDD §8.1), trophies breaking ties. */
  private ranking(live: LiveForest): LeaderboardEntry[] {
    const tiles = new Map<string, number>();
    for (const t of live.forest.tiles.values()) if (t.owner) tiles.set(t.owner, (tiles.get(t.owner) ?? 0) + 1);
    return [...live.forest.players.values()]
      .sort((a, b) => b.biomass - a.biomass || b.trophies - a.trophies || a.id.localeCompare(b.id))
      .map((p, i) => ({
        rank: i + 1,
        id: p.id,
        name: live.members.get(p.id)?.name ?? "?",
        biomass: p.biomass,
        trophies: p.trophies,
        tiles: tiles.get(p.id) ?? 0,
      }));
  }

  /**
   * Ends every forest whose season is over (GDD §7: classement figé dimanche 23h59, wipe lundi
   * 00h00): standings are archived, connected players are told, and the forest is dropped. Players
   * join a new forest of the new season when they come back. Returns true if a forest ended.
   */
  private async rollSeasons(now: number): Promise<boolean> {
    let ended = false;
    for (const live of [...this.forests.values()]) {
      const season = seasonAt(live.record.seasonStart);
      if (now < season.end) continue;
      ended = true;
      advanceForest(live.forest, season.end);
      const ranking = this.ranking(live);
      const standings: Standing[] = ranking.map((e) => ({
        playerId: e.id,
        rank: e.rank,
        players: ranking.length,
        biomass: e.biomass,
        trophies: e.trophies,
        tiles: e.tiles,
      }));
      await live.saving;
      await this.store.endForest(live.record.id, standings, season.end);
      this.log(`season week ${season.week} ended for forest #${live.record.number} (${ranking.length} players)`);
      for (const [id, clients] of live.clients) {
        const mine = standings.find((st) => st.playerId === id);
        const result: SeasonResult | null = mine
          ? {
              seasonStart: season.start,
              week: season.week,
              year: season.year,
              forestNumber: live.record.number,
              rank: mine.rank,
              players: mine.players,
              biomass: mine.biomass,
              trophies: mine.trophies,
              tiles: mine.tiles,
              seed: live.forest.seed,
            }
          : null;
        for (const c of clients) c.send({ type: "seasonEnded", result });
      }
      this.forests.delete(live.record.id);
      for (const id of live.forest.players.keys()) this.playerForest.delete(id);
    }
    return ended;
  }

  private comeBack(live: LiveForest, player: GameState, now: number): AwaySummary | undefined {
    const since = player.lastSeenAt;
    const mark = live.away.get(player.id);
    live.away.delete(player.id);
    if (since === null || now <= since || !mark) return undefined;
    const won = (live.won.get(player.id) ?? 0) - mark.won;
    const lost = (live.lost.get(player.id) ?? 0) - mark.lost;
    const gained = player.biomass - mark.biomass;
    return {
      awayMs: now - since,
      nutrients: gained / conversionRate(player.upgrades),
      biomass: gained,
      colonized: countTiles(live.forest, player.id) - mark.tiles - won + lost,
      won,
      lost,
    };
  }

  private liveOf(playerId: string): LiveForest | undefined {
    const id = this.playerForest.get(playerId);
    return id ? this.forests.get(id) : undefined;
  }

  /** The player's forest; a newcomer joins the oldest forest with room, or a new forest. */
  private async forestOf(account: Account): Promise<LiveForest | null> {
    const existing = this.liveOf(account.id);
    if (existing) return existing;
    const now = this.now();
    const season = seasonAt(now);
    let live = [...this.forests.values()]
      .sort((a, b) => a.record.number - b.record.number)
      .find((f) => f.record.seasonStart === season.start && freeSlices(f.forest).length > 0);
    live ??= await this.createForest();
    const player = joinForest(live.forest, account.id, now);
    if (!player) return null;
    // GDD §8.2: Monday bonus from last week's rank in their forest.
    const previousStart = seasonAt(season.start - 1).start;
    const previous = (await this.store.seasonHistory(account.id, 1)).find((r) => r.seasonStart === previousStart) ?? null;
    player.mondayBonus = mondayBonusFor(previous);
    live.members.set(account.id, account);
    this.playerForest.set(account.id, live.record.id);
    this.save(live);
    await live.saving;
    return live;
  }

  private createForest(): Promise<LiveForest> {
    this.creating ??= (async () => {
      const now = this.now();
      const forest = newForest(randomSeed(), now, this.capacity);
      const record = await this.store.createForest(forest, seasonAt(now).start);
      this.log(`created forest #${record.number}`);
      return this.adopt(record, forest, new Map());
    })().finally(() => (this.creating = null));
    return this.creating;
  }

  private adopt(record: ForestRecord, forest: ForestState, members: Map<string, Account>): LiveForest {
    const live: LiveForest = {
      record,
      forest,
      members,
      clients: new Map(),
      won: new Map(),
      lost: new Map(),
      away: new Map(),
      saving: Promise.resolve(),
    };
    this.forests.set(record.id, live);
    for (const id of forest.players.keys()) this.playerForest.set(id, record.id);
    return live;
  }

  /** Test robots: accounts `Robot01`… without password, placed in the first forest with room. */
  private async addBots(count: number): Promise<void> {
    for (let i = 1; i <= count; i++) {
      const name = `Robot${String(i).padStart(2, "0")}`;
      let account = await this.store.findAccountByName(name);
      if (account && !account.isBot) continue;
      account ??= await this.store.createAccount(name, null, true);
      const live = await this.forestOf(account);
      const player = live?.forest.players.get(account.id);
      if (player) player.lastSeenAt = null; // Robots play all the time.
    }
  }

  private save(live: LiveForest): void {
    live.saving = live.saving
      .then(() => this.store.saveForest(live.record.id, live.forest))
      .catch((err: unknown) => this.log(`save failed for forest #${live.record.number}: ${String(err)}`));
  }
}

function countTiles(forest: ForestState, playerId: string): number {
  let n = 0;
  for (const t of forest.tiles.values()) if (t.owner === playerId) n++;
  return n;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
