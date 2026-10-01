import {
  act,
  advance,
  advanceForest,
  botPlay,
  build,
  chooseStrain,
  buySporeUpgrade,
  buyUpgrade,
  enrich,
  enrichBlock,
  pickBud,
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
  demolish,
  fructify,
  moveHeart,
  refreshToxins,
  setAutomation,
  tileCounts,
  mutate,
  newForest,
  randomSeed,
  resolveBorders,
  resolveEvents,
  eventNotices,
  eventView,
  visibleEvents,
  seasonAt,
  TICK_MS,
  toSnapshot,
  unqueue,
  visibleKeys,
  ownedTilesOf,
  phaseAt,
  TERRAIN_STATS,
  zoneAt,
  TEST_FOREST_LIMITS,
  type AdminError,
  type AdminForest,
  type AdminOp,
  type AdminState,
  type TestForestSettings,
  type GameSnapshot,
  type TileDto,
  type ForestInfo,
  hexKey,
  type ActionResult,
  type Automation,
  type AuthError,
  type AwaySummary,
  type CaptureNotice,
  type EventDto,
  type Alert,
  type ActionId,
  type EventKind,
  type JournalLine,
  botAct,
  type ForestState,
  type GameState,
  type Leaderboard,
  type LeaderboardEntry,
  type OwnerInfo,
  type SeasonResult,
  type ServerMessage,
  type SessionResponse,
  canReadChat,
  CHAT,
  cleanChatText,
  guardChat,
  newChatGuard,
  PUSH,
  pushText,
  type ChatChannel,
  type ChatError,
  type ChatGuard,
  type ChatMessage,
  type PushKind,
  type PushLang,
  type RosterEntry,
  allianceScore,
  answerInvite,
  betray,
  botDiplomacy,
  chooseRelic,
  invite,
  invitesOf,
  isTainted,
  leavePact,
  listen,
  resolvePacts,
  sendResource,
  type AllianceEntry,
  type PactEvent,
  type SocialView,
  ACTIVE_WINDOW_MS,
  careerRewards,
  isReward,
  leagueAfter,
  leagueAfterAbsence,
  SECONDARY_BOARDS,
  seasonRewards,
  secondaryBoard,
  type ColorId,
  type Profile,
  type Reward,
  type SeasonLine,
  type SecondaryBoard,
  type SecondaryEntry,
  type SkinId,
  type TitleId,
} from "@mycelium/shared";
import { randomUUID } from "node:crypto";
import { hashPassword, hashToken, newToken, RateLimiter, verifyPassword } from "./auth";
import { MemoryScoreBoard, type ScoreBoard } from "./leaderboard";
import { NO_PUSH, type PushSender } from "./push";
import { NameTakenError, type Account, type ForestRecord, type GameStore, type Standing, type StoredChat } from "./store";

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
  /** Browser notifications (M7); off when omitted. */
  push?: PushSender;
  /** Names of the accounts that may cut other players' chat (M7 moderation) and, with `adminTools`, run test forests. */
  admins?: readonly string[];
  /** M9 hidden admin page (test forests): local development and staging only, never in production. */
  adminTools?: boolean;
  log?: (msg: string) => void;
}

/** A game clock: game time runs `scale` times faster than real time from (realBase, gameBase). */
interface Clock {
  realBase: number;
  gameBase: number;
  scale: number;
  paused: boolean;
}

/** A test forest (M9 admin tools): its settings and where it stands. In memory only. */
interface TestForest {
  settings: TestForestSettings;
  status: "running" | "paused" | "jumping" | "over";
  /** Game time it opened at. */
  openedAt: number;
  /** While jumping: the game time it is going to. */
  jumpTarget?: number;
}

interface AwayMark {
  biomass: number;
  tiles: number;
  won: number;
  lost: number;
}

/** What happened to a player while they were away, for the night journal (GDD §11). */
interface Journal {
  lostTo: Map<string, number>;
  wonFrom: Map<string, number>;
  heartLost: string[];
  /** "action|caster" → times. */
  actions: Map<string, number>;
  events: Map<EventKind, { tiles: number; biomass: number; enzymes: number; trophy: boolean }>;
  /** Pact events (M7): kind and who did it. */
  pacts: Array<{ event: PactEvent["kind"]; by: string }>;
}

const newJournal = (): Journal => ({ lostTo: new Map(), wonFrom: new Map(), heartLost: [], actions: new Map(), events: new Map(), pacts: [] });

/** A border fight on the same tiles by the same neighbour is announced at most this often. */
const ATTACK_ALERT_MS = 30 * 60_000;

interface LiveForest {
  record: ForestRecord;
  forest: ForestState;
  members: Map<string, Account>;
  clients: Map<string, Set<GameClient>>;
  /** Tiles won / lost per player since the server started (for the absence summary). */
  won: Map<string, number>;
  lost: Map<string, number>;
  away: Map<string, AwayMark>;
  journal: Map<string, Journal>;
  /** Alerts waiting for the next state message, by player. */
  alerts: Map<string, Alert[]>;
  /** Last "attacked" alert per defender|attacker (game time). */
  attackAlerted: Map<string, number>;
  /** The "season ends in an hour" notification went out. */
  seasonEndNotified: boolean;
  saving: Promise<void>;
  /** Game clock: the server's for regular forests, its own for a test forest (M9). */
  clock: Clock;
  /** Game time the forest was last simulated to by `tick`. */
  lastTick: number;
  /** When it was last saved (real time). */
  savedAt: number;
  /** Set for a test forest (M9 admin tools). */
  test: TestForest | null;
  /** Useful actions over the last game hour (players and robots), for the admin page. */
  actions: Array<{ at: number; id: string; n: number }>;
  /** Admins watching the forest through a robot's eyes: client → robot id (M9). */
  spectators: Map<GameClient, string>;
}

/** Forests are saved this often (real time). */
const SAVE_EVERY_MS = 15_000;
/** The server's timer: each forest ticks when TICK_MS of its game time went by (at most this often). */
const TIMER_MS = 250;
const HISTORY_SIZE = 5;
const BOT_SESSION_MS = 6 * 3_600_000;
/** Longest simulation step: a sped-up forest is simulated in steps of a minute at most (borders, events). */
const MAX_STEP_MS = 60_000;
/** Robots decide every 5 minutes of game time, like in the simulations. */
const BOT_DECISION_MS = 5 * 60_000;
/** Window of the actions-per-minute count of the admin page. */
const ACTIONS_WINDOW_MS = 3_600_000;

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
  /** The game clock of every regular forest (sped up by TIME_SCALE in local testing). */
  private readonly clock: Clock;
  private ticks = 0;
  private ticking = false;
  /** Number of the next test forest (M9). */
  private testNumber = 1;
  /** Admin accounts, as last seen (M9: to join a test forest as a player). */
  private readonly adminAccounts = new Map<string, Account>();
  private readonly adminTools: boolean;
  /** M9: admins playing in a test forest (account id → forest id). */
  private readonly playing = new Map<string, string>();
  /** M9: admins watching a test forest through a robot's eyes (account id → forest and robot). */
  private readonly following = new Map<string, { forest: string; bot: string }>();
  /** Admin accounts seen on this server (ids). */
  private readonly adminIds = new Set<string>();
  /** M9: the tiles last sent to each client, as JSON, so that states only carry what changed. */
  private readonly sent = new WeakMap<GameClient, Map<string, string>>();
  private readonly creating = new Map<number, Promise<LiveForest>>();
  /** Last client message per player (game time): connected time counts as active within 10 minutes of one. */
  private readonly lastAction = new Map<string, number>();
  private readonly push: PushSender;
  private readonly admins: Set<string>;
  /** Anti-spam memory per player (real time). */
  private readonly chatGuards = new Map<string, ChatGuard>();
  /** Players each connected player muted. */
  private readonly mutes = new Map<string, Set<string>>();
  /** Last notification per player|kind (game time). */
  private readonly pushed = new Map<string, number>();

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
    this.push = options.push ?? NO_PUSH;
    this.admins = new Set((options.admins ?? []).map((n) => n.toLowerCase()));
    this.adminTools = options.adminTools ?? false;
    const real = this.realNow();
    this.clock = { realBase: real, gameBase: real, scale: this.timeScale, paused: false };
  }

  /** Game clock of the regular forests: real time, sped up by `timeScale` in local testing. */
  now(): number {
    return this.clockNow(this.clock);
  }

  private clockNow(c: Clock): number {
    return c.paused ? c.gameBase : c.gameBase + (this.realNow() - c.realBase) * c.scale;
  }

  /** Game time of a forest (its own clock for a test forest). */
  private nowOf(live: LiveForest): number {
    return this.clockNow(live.clock);
  }

  /** Loads every forest, ends those whose season is over, adds the robots, and starts ticking. */
  async start(options: { tick?: boolean } = {}): Promise<void> {
    for (const record of await this.store.listForests()) {
      const loaded = await this.store.loadForest(record.id);
      if (loaded) this.adopt(loaded.record, loaded.forest, loaded.members);
    }
    // A sped-up clock must never run behind what was already simulated.
    const latest = Math.max(this.realNow(), ...[...this.forests.values()].map((f) => f.forest.updatedAt));
    this.clock.gameBase = latest;
    this.clock.realBase = this.realNow();
    for (const live of this.forests.values()) live.lastTick = Math.max(live.forest.updatedAt, Math.min(latest, this.now()));
    await this.rollSeasons(this.now());
    if (this.bots > 0) await this.addBots(this.bots);
    if (options.tick !== false) {
      // Every forest moves on once TICK_MS of its own game time went by (M9: test forests run faster).
      this.timer = setInterval(() => void this.tick(false), TIMER_MS);
    }
  }

  /** Stops ticking and saves everything; connected players count as gone from now. */
  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const live of this.forests.values()) {
      const now = this.nowOf(live);
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
    if (this.isAdmin(account)) {
      this.adminIds.add(account.id);
      this.adminAccounts.set(account.id, account);
    } else {
      this.playing.delete(account.id);
      this.following.delete(account.id);
    }
    // M9: an admin watching a test forest through a robot's eyes.
    const watch = this.following.get(account.id);
    if (watch) {
      const live = this.forests.get(watch.forest);
      if (live?.test && live.forest.players.has(watch.bot)) return this.attachSpectator(account, client, live, watch.bot);
      this.following.delete(account.id);
    }
    const live = await this.forestOf(account);
    if (!live) return false;
    // The session's account is fresh (an admin may have silenced it since the forest was loaded).
    live.members.set(account.id, account);
    const profile = await this.profileOf(account);
    const muted = new Set(await this.store.mutedBy(account.id));
    this.mutes.set(account.id, muted);
    const chat = await this.chatFor(live, account.id, muted);
    const now = this.nowOf(live);
    advanceForest(live.forest, now);
    const player = live.forest.players.get(account.id)!;
    this.lastAction.set(account.id, now);
    const clients = live.clients.get(account.id) ?? new Set();
    live.clients.set(account.id, clients);
    let away: AwaySummary | undefined;
    if (clients.size === 0) {
      away = this.comeBack(live, player, now);
      goOnline(player, now);
    }
    clients.add(client);
    const { game, owners } = this.view(live, player);
    this.remember(client, game);
    client.send({
      type: "ready",
      player: { id: account.id, name: account.name },
      forest: this.forestInfo(live),
      game,
      owners,
      serverTime: now,
      timeScale: live.clock.paused ? 0 : live.clock.scale,
      away,
      needsPassword: account.passwordHash === null,
      history: await this.store.seasonHistory(account.id, HISTORY_SIZE),
      forestEvents: this.eventsFor(live, account.id),
      roster: this.roster(live),
      chat,
      muted: [...muted],
      silencedUntil: account.silencedUntil,
      admin: this.isAdmin(account),
      ...(this.adminTools && this.isAdmin(account) ? { adminTools: true } : {}),
      social: this.socialOf(live, account.id, now),
      profile,
    });
    client.send({ type: "leaderboard", leaderboard: await this.leaderboard(live, account.id) });
    return true;
  }

  /** M9: an admin follows a robot of a test forest: the robot's game, read-only. */
  private async attachSpectator(account: Account, client: GameClient, live: LiveForest, botId: string): Promise<boolean> {
    const bot = live.forest.players.get(botId)!;
    const now = this.nowOf(live);
    advanceForest(live.forest, now);
    live.spectators.set(client, botId);
    const { game, owners } = this.view(live, bot);
    this.remember(client, game);
    const botName = live.members.get(botId)?.name ?? "?";
    client.send({
      type: "ready",
      player: { id: botId, name: botName },
      forest: this.forestInfo(live),
      game,
      owners,
      serverTime: now,
      timeScale: live.clock.paused ? 0 : live.clock.scale,
      needsPassword: false,
      history: [],
      forestEvents: this.eventsFor(live, botId),
      roster: this.roster(live),
      chat: [],
      muted: [],
      silencedUntil: null,
      admin: true,
      adminTools: this.adminTools,
      spectating: botName,
      social: this.socialOf(live, botId, now),
      profile: await this.profileOf(account),
    });
    client.send({ type: "leaderboard", leaderboard: await this.leaderboard(live, botId) });
    return true;
  }

  /** The forest as the client sees it. */
  private forestInfo(live: LiveForest): ForestInfo {
    return {
      id: live.record.id,
      number: live.record.number,
      capacity: live.forest.layout.capacity,
      players: live.forest.players.size,
      seasonStart: live.record.seasonStart,
      league: live.record.league,
      ...(live.test ? { test: live.test.settings.name } : {}),
    };
  }

  /** The tiles a client just got in full: the next states only carry what changed. */
  private remember(client: GameClient, game: GameSnapshot): void {
    this.sent.set(client, new Map(game.tiles.map((t) => [hexKey(t), JSON.stringify(t)])));
  }

  private isAdmin(account: Pick<Account, "name">): boolean {
    return this.admins.has(account.name.toLowerCase());
  }

  async detach(playerId: string, client: GameClient): Promise<void> {
    this.sent.delete(client);
    for (const live of this.forests.values()) live.spectators.delete(client);
    // The client may belong to another forest than the player's current one (an admin who switched, M9).
    const live = [...this.forests.values()].find((f) => f.clients.get(playerId)?.has(client));
    const clients = live?.clients.get(playerId);
    if (!live || !clients?.delete(client) || clients.size > 0) return;
    const now = this.nowOf(live);
    advanceForest(live.forest, now);
    const player = live.forest.players.get(playerId)!;
    goOffline(player, now);
    live.journal.set(playerId, newJournal());
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
    this.act_(playerId, client, (p, now) => colonize(p, { q, r }, now));
  }

  unqueue(playerId: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p) => unqueue(p, { q, r }));
  }

  moveHeart(playerId: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p, now) => moveHeart(p, { q, r }, now));
  }

  buyUpgrade(playerId: string, upgrade: string, client: GameClient): void {
    this.act_(playerId, client, (p) => buyUpgrade(p, upgrade));
  }

  /** M8: levels on one tile (1, 10 or "max"). */
  enrich(playerId: string, q: number, r: number, count: number | "max", client: GameClient): void {
    this.act_(playerId, client, (p) => enrich(p, { q, r }, count));
  }

  /** M8: one level on the tile and its neighbours of the colony. */
  enrichBlock(playerId: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p) => enrichBlock(p, { q, r }));
  }

  /** M8: picks a Bourgeon. */
  pickBud(playerId: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p, now) => pickBud(p, { q, r }, now));
  }

  build(playerId: string, q: number, r: number, structure: string, client: GameClient): void {
    this.act_(playerId, client, (p, now) => build(p, { q, r }, structure, now));
  }

  demolish(playerId: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p, now) => demolish(p, { q, r }, now));
  }

  mutate(playerId: string, mutation: string, client: GameClient): void {
    this.act_(playerId, client, (p, now) => mutate(p, mutation, now));
  }

  chooseStrain(playerId: string, strain: string, client: GameClient): void {
    this.act_(playerId, client, (p) => chooseStrain(p, strain));
  }

  fructify(playerId: string, radius: number, client: GameClient): void {
    this.act_(playerId, client, (p, now) => fructify(p, radius, now));
  }

  buySporeUpgrade(playerId: string, upgrade: string, client: GameClient): void {
    this.act_(playerId, client, (p) => buySporeUpgrade(p, upgrade));
  }

  /** Active action on an enemy tile (GDD §6.2); it changes the victim's tiles too. */
  act(playerId: string, action: string, q: number, r: number, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => {
      const victim = forest.tiles.get(`${q},${r}`)?.owner ?? null;
      const result = act(forest, p.id, action, { q, r }, now);
      const live = this.liveOf(playerId);
      if (result.ok && victim && live) this.recordAction(live, victim, action as ActionId, p.id, q, r);
      return result;
    });
  }

  setAutomation(playerId: string, change: { colonize?: string | null; upgrades?: boolean }, client: GameClient): void {
    this.act_(playerId, client, (p, now) => setAutomation(p, change as Partial<Automation>, now));
  }

  // -------------------------------------------------------------------------
  // Pacts, Signals and relics (M7)

  pactInvite(playerId: string, to: string, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => {
      const result = invite(forest, p.id, to, now);
      if (result.ok) this.pactEvents(this.liveOf(playerId)!, [{ kind: "invited", pact: p.pact, player: p.id, to: [to] }]);
      return result;
    });
  }

  pactAnswer(playerId: string, from: string, accept: boolean, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => {
      const result = answerInvite(forest, p.id, from, accept, now);
      if (!result.ok) return result;
      this.pactEvents(this.liveOf(playerId)!, [result.event]);
      return { ok: true };
    });
  }

  pactLeave(playerId: string, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => leavePact(forest, p.id, now));
  }

  pactBetray(playerId: string, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => {
      const result = betray(forest, p.id, now);
      if (!result.ok) return result;
      this.pactEvents(this.liveOf(playerId)!, result.events);
      return { ok: true };
    });
  }

  send(playerId: string, to: string, resource: "nutrients" | "enzymes", amount: number, client: GameClient): void {
    this.act_(playerId, client, (p, _now, forest) => sendResource(forest, p.id, to, resource, amount));
  }

  listen(playerId: string, target: string, client: GameClient): void {
    this.act_(playerId, client, (p, now, forest) => listen(forest, p.id, target, now));
  }

  chooseRelic(playerId: string, relic: string, client: GameClient): void {
    this.act_(playerId, client, (p) => chooseRelic(p, relic));
  }

  // -------------------------------------------------------------------------
  // M9 hidden admin page: test forests (local and staging only)

  /** Runs an admin request, then sends the admin page's state (or an error first). */
  async admin(playerId: string, op: AdminOp, client: GameClient): Promise<void> {
    if (!this.adminTools || !this.adminIds.has(playerId)) {
      client.send({ type: "adminError", error: "forbidden" });
      return;
    }
    const error = await this.runAdmin(playerId, op, client);
    if (error) client.send({ type: "adminError", error });
    client.send({ type: "admin", state: this.adminState(playerId) });
  }

  private async runAdmin(playerId: string, op: AdminOp, client: GameClient): Promise<AdminError | null> {
    if (op.op === "list") return null;
    if (op.op === "create") return this.createTestForest(playerId, op.settings, client);
    if (op.op === "give") {
      const live = this.liveOf(playerId);
      const player = live?.test ? live.forest.players.get(playerId) : undefined;
      if (!live || !player) return "not_playing";
      advanceForest(live.forest, this.nowOf(live));
      player.nutrients += op.nutrients ?? 0;
      player.enzymes += op.enzymes ?? 0;
      player.spores += op.spores ?? 0;
      player.biomass += op.biomass ?? 0;
      if ((op.enzymes ?? 0) > 0) player.enzymesUnlocked = true;
      for (const c of live.clients.get(playerId) ?? []) c.send(this.stateMessage(live, player, c, this.nowOf(live), { events: [], eventNotices: [], alerts: [] }));
      return null;
    }
    if (op.op === "play") {
      if (op.forest === null) {
        this.playing.delete(playerId);
        this.following.delete(playerId);
        client.send({ type: "adminSwitch" });
        return null;
      }
      const live = this.forests.get(op.forest);
      if (!live?.test) return "unknown_forest";
      if (live.test.settings.robotsOnly) return "invalid";
      if (!live.forest.players.has(playerId)) {
        const account = this.adminAccounts.get(playerId);
        if (!account) return "forbidden";
        const now = this.nowOf(live);
        const player = joinForest(live.forest, playerId, now);
        if (!player) return "full";
        live.members.set(playerId, account);
        this.broadcastRoster(live);
      }
      this.following.delete(playerId);
      this.playing.set(playerId, live.record.id);
      client.send({ type: "adminSwitch" });
      return null;
    }
    if (op.op === "follow") {
      if (op.forest === null) {
        this.following.delete(playerId);
        client.send({ type: "adminSwitch" });
        return null;
      }
      const live = this.forests.get(op.forest);
      if (!live?.test) return "unknown_forest";
      const bot = op.bot ?? [...live.members.values()].find((a) => a.isBot)?.id;
      if (!bot || !live.members.get(bot)?.isBot || !live.forest.players.has(bot)) return "invalid";
      this.following.set(playerId, { forest: live.record.id, bot });
      client.send({ type: "adminSwitch" });
      return null;
    }
    const live = this.forests.get(op.forest);
    if (!live?.test) return "unknown_forest";
    const test = live.test;
    switch (op.op) {
      case "pause":
        if (test.status === "jumping") return "busy";
        if (test.status === "running") {
          live.clock = { ...live.clock, gameBase: this.nowOf(live), realBase: this.realNow(), paused: true };
          test.status = "paused";
        }
        return null;
      case "resume":
        if (test.status === "jumping") return "busy";
        if (test.status === "paused") {
          live.clock = { ...live.clock, realBase: this.realNow(), paused: false };
          test.status = "running";
        }
        return null;
      case "speed":
        live.clock = { ...live.clock, gameBase: this.nowOf(live), realBase: this.realNow(), scale: op.timeScale };
        test.settings = { ...test.settings, timeScale: op.timeScale };
        return null;
      case "erase":
        this.eraseTestForest(live);
        return null;
      case "jump": {
        if (test.status === "jumping" || test.status === "over") return "busy";
        const target = seasonAt(live.record.seasonStart).days[op.day]!;
        if (target <= this.nowOf(live)) return "invalid";
        void this.jumpTestForest(live, target);
        return null;
      }
    }
  }

  /** Creates a test forest with its robots (and the admin, if asked). */
  private async createTestForest(adminId: string, settings: TestForestSettings, client: GameClient): Promise<AdminError | null> {
    if ([...this.forests.values()].filter((f) => f.test).length >= TEST_FOREST_LIMITS.maxForests) return "too_many";
    const number = this.testNumber++;
    // The forest opens at the start of the chosen day of this week, on its own clock.
    const start = seasonAt(this.now()).days[settings.startDay]!;
    const seed = settings.seed ?? randomSeed();
    const forest = newForest(seed, start, settings.capacity);
    const record: ForestRecord = { id: randomUUID(), number, seasonStart: seasonAt(start).start, league: 0 };
    const clock: Clock = { realBase: this.realNow(), gameBase: start, scale: settings.timeScale, paused: false };
    const live = this.adopt(record, forest, new Map(), { settings: { ...settings, seed }, status: "running", openedAt: start }, clock);
    live.lastTick = start;
    for (let i = 1; i <= settings.bots; i++) {
      const id = randomUUID();
      const account: Account = {
        id,
        name: `T${number}-Robot${String(i).padStart(2, "0")}`,
        passwordHash: null,
        isBot: true,
        silencedUntil: null,
        league: 0,
        title: null,
        color: null,
        skin: null,
      };
      const player = joinForest(forest, id, start);
      if (!player) break;
      player.lastSeenAt = null; // Robots play all the time.
      live.members.set(id, account);
      this.playerForest.set(id, record.id);
    }
    this.log(`test forest T${number} "${settings.name}" created (seed ${seed}, ${settings.bots} robots, ×${settings.timeScale})`);
    if (settings.withMe) return this.runAdmin(adminId, { op: "play", forest: record.id }, client);
    return null;
  }

  /** Erases a test forest: its robots go, admins in it go back to their own forest. */
  private eraseTestForest(live: LiveForest): void {
    this.forests.delete(live.record.id);
    for (const [id, account] of live.members) if (account.isBot) this.playerForest.delete(id);
    for (const [id, forest] of this.playing) if (forest === live.record.id) this.playing.delete(id);
    for (const [id, watch] of this.following) if (watch.forest === live.record.id) this.following.delete(id);
    for (const clients of live.clients.values()) for (const c of clients) c.send({ type: "adminSwitch" });
    for (const c of live.spectators.keys()) c.send({ type: "adminSwitch" });
    this.log(`test forest T${live.record.number} erased`);
  }

  /**
   * Simulates a test forest up to `target` (game time) as fast as the server can, a few hours of game
   * time at a time so that the server keeps answering; then its clock carries on from there.
   */
  private async jumpTestForest(live: LiveForest, target: number): Promise<void> {
    const test = live.test!;
    const wasPaused = test.status === "paused";
    test.status = "jumping";
    test.jumpTarget = target;
    const from = live.lastTick;
    try {
      for (let t = from; t < target && this.forests.get(live.record.id) === live; ) {
        const next = Math.min(target, t + 2 * 3_600_000);
        this.stepForest(live, t, next);
        t = next;
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      live.clock = { ...live.clock, gameBase: live.lastTick, realBase: this.realNow(), paused: wasPaused };
      test.status = wasPaused ? "paused" : "running";
      delete test.jumpTarget;
      live.alerts.clear();
      this.log(`test forest T${live.record.number} jumped to ${new Date(live.lastTick).toISOString()}`);
    }
  }

  /** The admin page's view of the test forests. */
  private adminState(playerId: string): AdminState {
    const forests: AdminForest[] = [];
    for (const live of this.forests.values()) {
      if (!live.test) continue;
      const now = live.test.status === "jumping" ? live.lastTick : this.nowOf(live);
      const fillable = (t: { terrain: keyof typeof TERRAIN_STATS }) => t.terrain !== "wetland" && !TERRAIN_STATS[t.terrain].paidInEnzymes;
      let land = 0;
      let owned = 0;
      for (const t of live.forest.tiles.values()) {
        if (!fillable(t)) continue;
        land++;
        if (t.owner !== null) owned++;
      }
      const since = now - ACTIONS_WINDOW_MS;
      const recent = live.actions.filter((a) => a.at >= since);
      // Per minute over the last hour, or since the forest opened.
      const minutes = Math.max(1, Math.min(ACTIONS_WINDOW_MS, now - live.test.openedAt) / 60_000);
      const perPlayer = new Map<string, number>();
      for (const a of recent) perPlayer.set(a.id, (perPlayer.get(a.id) ?? 0) + a.n);
      let bots = 0;
      let humans = 0;
      for (const [id, n] of perPlayer) {
        if (live.members.get(id)?.isBot) bots += n;
        else humans += n;
      }
      const counts = tileCounts(live.forest);
      forests.push({
        id: live.record.id,
        number: live.record.number,
        name: live.test.settings.name,
        status: live.test.status,
        seed: live.forest.seed,
        settings: live.test.settings,
        gameTime: now,
        day: phaseAt(now).index,
        occupancy: land > 0 ? owned / land : 0,
        apm: { bots: bots / minutes, humans: humans / minutes },
        players: [...live.forest.players.values()].map((p) => {
          let zone = 0;
          for (const t of ownedTilesOf(live.forest.tiles, p.id)) if (t.growthEndsAt === null) zone = Math.max(zone, zoneAt(live.forest.layout, live.forest.radius, t));
          return {
            id: p.id,
            name: live.members.get(p.id)?.name ?? "?",
            bot: live.members.get(p.id)?.isBot ?? false,
            tiles: counts.get(p.id) ?? 0,
            biomass: p.biomass,
            zone,
            apm: (perPlayer.get(p.id) ?? 0) / minutes,
          };
        }),
        ...(live.test.jumpTarget !== undefined ? { jumpTarget: live.test.jumpTarget } : {}),
      });
    }
    return {
      tools: this.adminTools,
      forests,
      playing: this.playing.get(playerId) ?? null,
      following: this.following.get(playerId) ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Profile, cosmetics and active time (M7)

  /** Any client message: the player is active (M7 efficiency). */
  touch(playerId: string): void {
    const live = this.liveOf(playerId);
    this.lastAction.set(playerId, live ? this.nowOf(live) : this.now());
  }

  /** Shows a title, a colour or a skin the account won (null: none), and tells the forest. */
  async setCosmetic(playerId: string, kind: "title" | "color" | "skin", id: string | null, client: GameClient): Promise<void> {
    const live = this.liveOf(playerId);
    const account = live?.members.get(playerId);
    if (!live || !account) return;
    if (id !== null) {
      const owned = await this.store.rewardsOf(playerId);
      if (!isReward(kind, id) || !owned.some((r) => r.kind === kind && r.id === id)) {
        client.send({ type: "actionError", error: "locked" });
        return;
      }
    }
    await this.store.setCosmetic(playerId, kind, id);
    live.members.set(playerId, { ...account, [kind]: id });
    const profile = await this.profileOf(live.members.get(playerId)!);
    for (const c of live.clients.get(playerId) ?? []) c.send({ type: "profile", profile });
    this.broadcastRoster(live);
  }

  private async profileOf(account: Account): Promise<Profile> {
    const [rewards, career] = await Promise.all([this.store.rewardsOf(account.id), this.store.careerOf(account.id)]);
    return {
      league: account.league,
      title: (account.title as TitleId | null) ?? null,
      color: (account.color as ColorId | null) ?? null,
      skin: (account.skin as SkinId | null) ?? null,
      rewards,
      career,
    };
  }

  /** Tells the players concerned: an alert now, a line in their night journal. */
  private pactEvents(live: LiveForest, events: PactEvent[]): void {
    for (const e of events) {
      for (const id of e.to) {
        pushAlert(live, id, { type: "pact", event: e.kind, by: e.player });
        this.journalOf(live, id).pacts.push({ event: e.kind, by: e.player });
      }
    }
  }

  /** The player's pact and invitations. */
  private socialOf(live: LiveForest, playerId: string, now: number): SocialView {
    const pact = live.forest.pacts.find((p) => p.endedAt === null && p.members.includes(playerId));
    const invites = invitesOf(live.forest, playerId, now);
    return {
      pact: pact
        ? { id: pact.id, members: [...pact.members], leaving: { ...pact.leaving }, createdAt: pact.createdAt, score: allianceScore(live.forest, pact) }
        : null,
      invitesIn: invites.filter((i) => i.to === playerId).map((i) => ({ from: i.from, at: i.at })),
      invitesOut: invites.filter((i) => i.from === playerId).map((i) => ({ to: i.to, at: i.at })),
    };
  }

  // -------------------------------------------------------------------------
  // Chat, private messages and moderation (M7)

  /** Sends a message to the forest, the player's pact or one player. */
  async chat(playerId: string, channel: ChatChannel, text: string, to: string | undefined, client: GameClient): Promise<void> {
    const live = this.liveOf(playerId);
    if (!live || !live.clients.get(playerId)?.has(client)) {
      client.send({ type: "actionError", error: "not_authenticated" });
      return;
    }
    const error = await this.postChat(live, playerId, channel, text, to);
    if (error) client.send({ type: "chatError", error });
  }

  mute(playerId: string, other: string, muted: boolean): Promise<void> {
    const set = this.mutes.get(playerId) ?? new Set<string>();
    this.mutes.set(playerId, set);
    if (other === playerId) return Promise.resolve();
    if (muted) set.add(other);
    else set.delete(other);
    return this.store.setMute(playerId, other, muted);
  }

  /** Reports a message the player can read (kept for the owner). */
  async report(playerId: string, messageId: number, client: GameClient): Promise<void> {
    const live = this.liveOf(playerId);
    const message = await this.store.findChat(messageId);
    if (!live || !message || message.forestId !== live.record.id || message.from === playerId) return;
    if (!canReadChat(message, playerId, this.pactOf(live, playerId))) return;
    await this.store.reportChat(messageId, playerId);
    this.log(`chat message #${messageId} from ${message.fromName} reported by ${live.members.get(playerId)?.name ?? "?"}`);
    client.send({ type: "chatNotice", notice: "reported" });
  }

  /** Admins: cuts a player's chat for a day. */
  async silence(playerId: string, target: string, client: GameClient): Promise<void> {
    const live = this.liveOf(playerId);
    const admin = live?.members.get(playerId);
    const account = live?.members.get(target);
    if (!live || !admin || !account || !this.admins.has(admin.name.toLowerCase())) return;
    const until = this.realNow() + CHAT.silenceMs;
    await this.store.silence(target, until);
    live.members.set(target, { ...account, silencedUntil: until });
    this.log(`${account.name} silenced by ${admin.name} until ${new Date(until).toISOString()}`);
    client.send({ type: "chatNotice", notice: "silenced", name: account.name });
  }

  async subscribePush(playerId: string, sub: { endpoint: string; p256dh: string; auth: string; lang: PushLang; kinds: PushKind[] }): Promise<void> {
    if (!this.push.publicKey || !this.playerForest.has(playerId)) return;
    await this.store.savePushSubscription({ ...sub, playerId });
  }

  unsubscribePush(playerId: string, endpoint: string): Promise<void> {
    return this.store.removePushSubscription(endpoint, playerId);
  }

  /** Public key browsers subscribe with, null when notifications are off. */
  pushKey(): string | null {
    return this.push.publicKey;
  }

  private async postChat(live: LiveForest, from: string, channel: ChatChannel, raw: string, to: string | undefined): Promise<ChatError | null> {
    const account = live.members.get(from);
    if (!account) return "unknown_player";
    const real = this.realNow();
    if (account.silencedUntil !== null && account.silencedUntil > real) return "silenced";
    const clean = cleanChatText(raw);
    if (!clean.ok) return clean.error;
    let pact: string | null = null;
    if (channel === "dm") {
      if (to === from) return "self";
      if (!to || !live.members.has(to)) return "unknown_player";
    } else if (channel === "pact") {
      pact = this.pactOf(live, from);
      if (pact === null) return "no_pact";
    }
    const guard = this.chatGuards.get(from) ?? newChatGuard();
    this.chatGuards.set(from, guard);
    const refused = guardChat(guard, clean.text, real);
    if (refused) return refused;
    const stored = await this.store.addChat({
      forestId: live.record.id,
      channel,
      pact,
      from,
      to: channel === "dm" ? to! : null,
      text: clean.text,
      at: this.nowOf(live),
    });
    const message = publicChat(stored);
    for (const [id, clients] of live.clients) {
      if (clients.size === 0 || !canReadChat(stored, id, this.pactOf(live, id))) continue;
      if (id !== from && this.mutes.get(id)?.has(from)) continue;
      for (const c of clients) c.send({ type: "chat", message });
    }
    if (channel === "dm" && to) {
      const muted = this.mutes.get(to) ?? new Set(await this.store.mutedBy(to));
      if (!muted.has(from)) this.notify(live, to, "dm", { name: account.name, text: clean.text });
    }
    return null;
  }

  /** The messages a player can read, without those of the players they muted. */
  private async chatFor(live: LiveForest, playerId: string, muted: Set<string>): Promise<ChatMessage[]> {
    const pact = this.pactOf(live, playerId);
    const all = await this.store.chatHistory(live.record.id, CHAT.history * 4);
    return all
      .filter((m) => canReadChat(m, playerId, pact) && (m.from === playerId || !muted.has(m.from)))
      .slice(-CHAT.history)
      .map(publicChat);
  }

  /** The player's pact, null without one. */
  private pactOf(live: LiveForest, playerId: string): string | null {
    return live.forest.players.get(playerId)?.pact ?? null;
  }

  private roster(live: LiveForest): RosterEntry[] {
    return [...live.forest.players.keys()].map((id) => {
      const o = this.ownerInfo(live, id, new Map(), null);
      const a = live.members.get(id);
      const entry: RosterEntry = { id, name: o.name, color: o.color, league: a?.league ?? 0 };
      if (a?.title) entry.title = a.title as TitleId;
      if (o.rewardColor) entry.rewardColor = o.rewardColor;
      if (o.skin) entry.skin = o.skin;
      return entry;
    });
  }

  private broadcastRoster(live: LiveForest): void {
    const roster = this.roster(live);
    for (const clients of live.clients.values()) for (const c of clients) c.send({ type: "roster", roster });
  }

  /**
   * Browser notification (M7) to a player who is not connected, if they asked for this kind; at
   * most one per kind every 30 min. Runs in the background.
   */
  private notify(live: LiveForest, playerId: string, kind: PushKind, params: { name?: string; text?: string } = {}): void {
    if (live.test || !this.push.publicKey || (live.clients.get(playerId)?.size ?? 0) > 0 || live.members.get(playerId)?.isBot) return;
    const now = this.nowOf(live);
    const key = `${playerId}|${kind}`;
    const last = this.pushed.get(key);
    if (last !== undefined && now - last < PUSH.throttleMs) return;
    void (async () => {
      const subs = (await this.store.pushSubscriptions(playerId)).filter((sub) => sub.kinds.includes(kind));
      if (subs.length === 0) return;
      this.pushed.set(key, now);
      for (const sub of subs) {
        const result = await this.push.send(sub, { ...pushText(kind, sub.lang, params), tag: kind });
        if (result === "gone") await this.store.removePushSubscription(sub.endpoint);
      }
    })().catch((err: unknown) => this.log(`notification failed: ${String(err)}`));
  }

  /**
   * One simulation step for every forest whose game time moved on by a tick (or `force`, used by tests):
   * economy, borders, robots, views, leaderboard, saves.
   */
  async tick(force = true): Promise<void> {
    // The timer may fire again while a tick is still sending: skip it rather than run two at once.
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.tickAll(force);
    } finally {
      this.ticking = false;
    }
  }

  private async tickAll(force: boolean): Promise<void> {
    this.ticks++;
    if (await this.rollSeasons(this.now())) {
      if (this.bots > 0) await this.addBots(this.bots);
    }
    await Promise.all([...this.forests.values()].map((live) => this.tickForest(live, force)));
  }

  /** Brings one forest up to its game time and tells its players (M9: each forest has its own clock). */
  private async tickForest(live: LiveForest, force: boolean): Promise<void> {
    if (live.test && live.test.status !== "running") return;
    let now = this.nowOf(live);
    if (!force && now - live.lastTick < TICK_MS) return;
    if (live.test) {
      // A test forest stops at the end of its season: no standings, no rewards, it just stays there.
      const end = seasonAt(live.record.seasonStart).end;
      if (now >= end) {
        now = end;
        live.test.status = "over";
        live.clock = { ...live.clock, gameBase: end, realBase: this.realNow(), paused: true };
      }
    }
    const step = now > live.lastTick ? this.stepForest(live, live.lastTick, now) : { notices: new Map(), happenings: [] };
    const season = seasonAt(live.record.seasonStart);
    if (!live.test && !live.seasonEndNotified && now >= season.freezeAt - 3_600_000 && now < season.freezeAt) {
      live.seasonEndNotified = true;
      for (const id of live.forest.players.keys()) this.notify(live, id, "seasonEnd");
    }
    if (!live.test) {
      await this.scores.publish(
        live.record.seasonStart,
        live.record.id,
        [...live.forest.players.values()].map((p) => [p.id, p.biomass] as const),
      );
    }
    await this.sendStates(live, now, step);
    live.alerts.clear();
    if (this.realNow() - live.savedAt >= SAVE_EVERY_MS) this.save(live);
  }

  /**
   * Simulates a forest from `from` to `to` (game time), in steps of a minute at most: economy, pacts, active
   * time, borders, events, robots. Returns what the players must be told.
   */
  private stepForest(live: LiveForest, from: number, to: number): StepOutcome {
    const notices = new Map<string, CaptureNotice[]>();
    const happenings: ReturnType<typeof resolveEvents> = [];
    let t = from;
    while (t < to) {
      const next = Math.min(to, t + MAX_STEP_MS);
      const dt = next - t;
      t = next;
      advanceForest(live.forest, t);
      this.pactEvents(live, resolvePacts(live.forest, t));
      // M7 efficiency: connected time with an action in the last 10 minutes.
      for (const [id, clients] of live.clients) {
        const last = this.lastAction.get(id);
        const player = live.forest.players.get(id);
        if (clients.size > 0 && player && last !== undefined && t - last <= ACTIVE_WINDOW_MS) player.activeMs += Math.max(0, dt);
      }
      const before = new Map<string, string>();
      for (const [k, tile] of live.forest.tiles) if (tile.capture) before.set(k, tile.capture.by);
      const events = resolveBorders(live.forest, dt, t);
      this.alertAttacks(live, before, t);
      const now = resolveEvents(live.forest, dt, t);
      happenings.push(...now);
      for (const h of now) {
        if (h.phase === "announced" && h.event.kind === "tree") {
          for (const id of live.forest.players.keys()) this.notify(live, id, "boss");
        }
        for (const l of h.lost) {
          live.lost.set(l.player, (live.lost.get(l.player) ?? 0) + 1);
          this.journalEvent(live, l.player, h.event.kind).tiles++;
        }
        for (const r of h.rewards) {
          const j = this.journalEvent(live, r.player, h.event.kind);
          j.biomass += r.biomass;
          j.enzymes += r.enzymes;
          j.trophy ||= r.trophy;
        }
      }
      for (const e of events) {
        live.won.set(e.to, (live.won.get(e.to) ?? 0) + 1);
        live.lost.set(e.from, (live.lost.get(e.from) ?? 0) + 1);
        const lostJ = this.journalOf(live, e.from);
        lostJ.lostTo.set(e.to, (lostJ.lostTo.get(e.to) ?? 0) + 1);
        if (e.heart) lostJ.heartLost.push(e.to);
        const wonJ = this.journalOf(live, e.to);
        wonJ.wonFrom.set(e.from, (wonJ.wonFrom.get(e.from) ?? 0) + 1);
        const heart = e.heart ? { heart: true as const } : {};
        push(notices, e.to, { q: e.q, r: e.r, kind: "won", other: e.from, ...heart });
        push(notices, e.from, { q: e.q, r: e.r, kind: "lost", other: e.to, ...heart });
      }
      // Robots decide every 5 minutes of game time.
      if (Math.floor(t / BOT_DECISION_MS) !== Math.floor((t - dt) / BOT_DECISION_MS)) {
        for (const [id, account] of live.members) {
          if (!account.isBot) continue;
          const bot = live.forest.players.get(id);
          if (!bot) continue;
          let n = botPlay(bot, t, Math.floor(t / BOT_SESSION_MS) !== Math.floor((t - BOT_DECISION_MS) / BOT_SESSION_MS));
          const used = botAct(live.forest, bot, t);
          // Tell the victim, as for a human caster.
          if (used) {
            n++;
            this.recordAction(live, used.victim, used.action, id, used.q, used.r);
          }
          this.pactEvents(live, botDiplomacy(live.forest, bot, t));
          this.countActions(live, id, t, n);
        }
      }
    }
    live.lastTick = to;
    return { notices, happenings };
  }

  /** Sends every connected player (and every admin watching) their state and the leaderboard. */
  private async sendStates(live: LiveForest, now: number, step: StepOutcome): Promise<void> {
    for (const [id, clients] of live.clients) {
      if (clients.size === 0) {
        live.alerts.delete(id);
        continue;
      }
      const player = live.forest.players.get(id);
      if (!player) continue;
      const board = await this.leaderboard(live, id);
      for (const c of clients) {
        c.send(this.stateMessage(live, player, c, now, {
          events: step.notices.get(id) ?? [],
          eventNotices: eventNotices(step.happenings, id),
          alerts: live.alerts.get(id) ?? [],
        }));
        c.send({ type: "leaderboard", leaderboard: board });
      }
    }
    for (const [c, botId] of live.spectators) {
      const bot = live.forest.players.get(botId);
      if (!bot) continue;
      c.send(this.stateMessage(live, bot, c, now, { events: step.notices.get(botId) ?? [], eventNotices: eventNotices(step.happenings, botId), alerts: [] }));
      c.send({ type: "leaderboard", leaderboard: await this.leaderboard(live, botId) });
    }
  }

  /** A state message for one client: only the tiles that changed since its last message (M9). */
  private stateMessage(
    live: LiveForest,
    player: GameState,
    client: GameClient,
    now: number,
    extra: { events: CaptureNotice[]; eventNotices: ReturnType<typeof eventNotices>; alerts: Alert[] },
  ): ServerMessage {
    const { game, owners } = this.view(live, player);
    const { tiles, gone } = this.tilesFor(client, game.tiles);
    return {
      type: "state",
      game: { ...game, tiles },
      delta: true,
      ...(gone.length > 0 ? { gone } : {}),
      owners,
      serverTime: now,
      events: extra.events,
      forestEvents: this.eventsFor(live, player.id),
      eventNotices: extra.eventNotices,
      alerts: extra.alerts,
      social: this.socialOf(live, player.id, now),
    };
  }

  /**
   * The tiles to send to a client: those that changed since its last message, and the keys of those it no
   * longer sees. A client without history (just attached) gets everything.
   */
  private tilesFor(client: GameClient, all: TileDto[]): { tiles: TileDto[]; gone: string[] } {
    let last = this.sent.get(client);
    const fresh = !last;
    last ??= new Map();
    this.sent.set(client, last);
    const tiles: TileDto[] = [];
    const seen = new Set<string>();
    for (const t of all) {
      const key = hexKey(t);
      seen.add(key);
      const json = JSON.stringify(t);
      if (fresh || last.get(key) !== json) {
        tiles.push(t);
        last.set(key, json);
      }
    }
    const gone: string[] = [];
    for (const key of last.keys()) {
      if (!seen.has(key)) {
        gone.push(key);
        last.delete(key);
      }
    }
    return { tiles, gone };
  }

  /** Counts useful actions for the admin page (actions per minute over the last game hour). */
  private countActions(live: LiveForest, id: string, at: number, n: number): void {
    if (n <= 0) return;
    live.actions.push({ at, id, n });
    while (live.actions.length > 0 && live.actions[0]!.at < at - ACTIONS_WINDOW_MS) live.actions.shift();
  }

  /** For tests and diagnostics. */
  forestState(playerId: string): ForestState | undefined {
    return this.liveOf(playerId)?.forest;
  }

  // -------------------------------------------------------------------------

  private act_(playerId: string, client: GameClient, action: (p: GameState, now: number, forest: ForestState) => ActionResult): void {
    if (this.following.has(playerId)) {
      client.send({ type: "actionError", error: "spectating" });
      return;
    }
    const live = this.liveOf(playerId);
    if (!live || !live.clients.get(playerId)?.has(client)) {
      client.send({ type: "actionError", error: "not_authenticated" });
      return;
    }
    if (live.test?.status === "jumping") {
      client.send({ type: "actionError", error: "busy" });
      return;
    }
    const now = this.nowOf(live);
    advanceForest(live.forest, now);
    const player = live.forest.players.get(playerId)!;
    const result = action(player, now, live.forest);
    if (!result.ok) {
      client.send({ type: "actionError", error: result.error });
      return;
    }
    this.countActions(live, playerId, now, 1);
    advance(player, now);
    refreshToxins(live.forest); // Toxines and captures change the neighbours' tiles.
    for (const c of live.clients.get(playerId)!) c.send(this.stateMessage(live, player, c, now, { events: [], eventNotices: [], alerts: [] }));
  }

  /** What a player sees: their game, the tiles near their network, and who owns them. */
  private view(live: LiveForest, player: GameState): { game: ReturnType<typeof toSnapshot>; owners: OwnerInfo[] } {
    const game = toSnapshot(player, visibleKeys(live.forest, player.id));
    const ids = new Set<string>([player.id]);
    for (const t of game.tiles) {
      if (t.owner) ids.add(t.owner);
      if (t.capture) ids.add(t.capture.by);
      for (const e of t.e ?? []) ids.add(e.by);
    }
    const counts = tileCounts(live.forest);
    // Allies are shown as such, and tainted colonies to everybody.
    for (const a of player.allies) ids.add(a);
    return { game, owners: [...ids].map((id) => this.ownerInfo(live, id, counts, player)) };
  }

  private journalOf(live: LiveForest, playerId: string): Journal {
    let j = live.journal.get(playerId);
    if (!j) {
      j = newJournal();
      live.journal.set(playerId, j);
    }
    return j;
  }

  private journalEvent(live: LiveForest, playerId: string, kind: EventKind): { tiles: number; biomass: number; enzymes: number; trophy: boolean } {
    const j = this.journalOf(live, playerId);
    let e = j.events.get(kind);
    if (!e) {
      e = { tiles: 0, biomass: 0, enzymes: 0, trophy: false };
      j.events.set(kind, e);
    }
    return e;
  }

  /** An action hit `victim`: an alert now, a line in their journal. */
  private recordAction(live: LiveForest, victim: string, action: ActionId, by: string, q: number, r: number): void {
    const key = `${action}|${by}`;
    const j = this.journalOf(live, victim);
    j.actions.set(key, (j.actions.get(key) ?? 0) + 1);
    pushAlert(live, victim, { type: "action", action, by, q, r });
  }

  /** Alerts the owners of tiles on which a neighbour just started pushing (throttled per neighbour). */
  private alertAttacks(live: LiveForest, before: Map<string, string>, now: number): void {
    for (const [k, t] of live.forest.tiles) {
      if (!t.capture || !t.owner || before.get(k) === t.capture.by) continue;
      const key = `${t.owner}|${t.capture.by}`;
      const last = live.attackAlerted.get(key);
      if (last !== undefined && now - last < ATTACK_ALERT_MS) continue;
      live.attackAlerted.set(key, now);
      const owner = live.forest.players.get(t.owner);
      const heart = owner !== undefined && owner.heart.q === t.q && owner.heart.r === t.r;
      pushAlert(live, t.owner, { type: "attacked", by: t.capture.by, q: t.q, r: t.r, ...(heart ? { heart: true as const } : {}) });
      this.notify(live, t.owner, heart ? "heart" : "attacked", { name: live.members.get(t.capture.by)?.name ?? "?" });
    }
  }

  private journalLines(live: LiveForest, playerId: string): JournalLine[] {
    const j = live.journal.get(playerId);
    if (!j) return [];
    const name = (id: string) => live.members.get(id)?.name ?? "?";
    const lines: JournalLine[] = [];
    for (const by of j.heartLost) lines.push({ type: "heartLost", name: name(by) });
    for (const [id, n] of [...j.lostTo].sort((a, b) => b[1] - a[1])) lines.push({ type: "lostTo", name: name(id), tiles: n });
    for (const [id, n] of [...j.wonFrom].sort((a, b) => b[1] - a[1])) lines.push({ type: "wonFrom", name: name(id), tiles: n });
    for (const [key, n] of j.actions) {
      const [action, by] = key.split("|") as [ActionId, string];
      lines.push({ type: "action", action, name: name(by), count: n });
    }
    for (const [kind, e] of j.events) lines.push({ type: "event", kind, ...e });
    for (const e of j.pacts) lines.push({ type: "pact", event: e.event, name: name(e.by) });
    return lines;
  }

  private eventsFor(live: LiveForest, playerId: string): EventDto[] {
    return visibleEvents(live.forest).map((e) => eventView(e, playerId));
  }

  private ownerInfo(live: LiveForest, id: string, counts: Map<string, number>, viewer: GameState | null): OwnerInfo {
    const p = live.forest.players.get(id);
    const slice = p ? live.forest.spawns.findIndex((s) => s.q === p.spawn.q && s.r === p.spawn.r) : 0;
    const info: OwnerInfo = { id, name: live.members.get(id)?.name ?? "?", color: Math.max(0, slice), tiles: counts.get(id) ?? 0 };
    if (viewer?.allies.includes(id)) info.ally = true;
    if (p && isTainted(p, live.forest.updatedAt)) info.tainted = true;
    const account = live.members.get(id);
    if (account?.skin) info.skin = account.skin as SkinId;
    // A reward colour is shown only by the earliest player of the forest who chose it.
    if (account?.color && p) {
      const first = [...live.forest.players.values()]
        .filter((o) => live.members.get(o.id)?.color === account.color)
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
      if (first?.id === id) info.rewardColor = account.color as ColorId;
    }
    return info;
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
      alliances: this.alliances(live),
      secondary: this.secondary(live),
    };
  }

  /** What each colony did this season, for every leaderboard (M7). */
  private seasonLines(live: LiveForest): SeasonLine[] {
    const tiles = tileCounts(live.forest);
    const boss = new Map<string, number>();
    for (const e of live.forest.events) {
      if (e.kind !== "tree" || !e.damage) continue;
      for (const [id, d] of Object.entries(e.damage)) boss.set(id, (boss.get(id) ?? 0) + d);
    }
    return [...live.forest.players.values()].map((p) => ({
      playerId: p.id,
      biomass: p.biomass,
      trophies: p.trophies,
      tiles: tiles.get(p.id) ?? 0,
      conquests: p.conquests,
      boss: boss.get(p.id) ?? 0,
      activeMs: p.activeMs,
      fruitings: p.fruitings,
    }));
  }

  private secondary(live: LiveForest): Record<SecondaryBoard, SecondaryEntry[]> {
    const lines = this.seasonLines(live);
    const out = {} as Record<SecondaryBoard, SecondaryEntry[]>;
    for (const board of SECONDARY_BOARDS) {
      out[board] = secondaryBoard(lines, board).map((r) => ({ rank: r.rank, id: r.playerId, name: live.members.get(r.playerId)?.name ?? "?", value: r.value }));
    }
    return out;
  }

  /** The forest's alliance leaderboard (M7): biomass earned by members while in the pact. */
  private alliances(live: LiveForest): AllianceEntry[] {
    const name = (id: string) => live.members.get(id)?.name ?? "?";
    return live.forest.pacts
      .map((p) => ({ id: p.id, members: [...p.members, ...p.former.filter((f) => !p.members.includes(f))].map(name), score: allianceScore(live.forest, p), active: p.endedAt === null }))
      .filter((a) => a.score > 0 || a.active)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((a, i) => ({ rank: i + 1, ...a }));
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
      // Test forests (M9) end on their own clock, without standings (see tickForest).
      if (live.test) continue;
      const season = seasonAt(live.record.seasonStart);
      if (now < season.end) continue;
      ended = true;
      advanceForest(live.forest, season.end);
      const ranking = this.ranking(live);
      const lines = new Map(this.seasonLines(live).map((l) => [l.playerId, l]));
      // M7 leagues: the first 3 go up, the last 3 down.
      const leagues = new Map(ranking.map((e) => [e.id, leagueAfter(live.members.get(e.id)?.league ?? 0, e.rank, ranking.length)]));
      const standings: Standing[] = ranking.map((e) => {
        const l = lines.get(e.id)!;
        return {
          playerId: e.id,
          rank: e.rank,
          players: ranking.length,
          biomass: e.biomass,
          trophies: e.trophies,
          tiles: e.tiles,
          conquests: l.conquests,
          boss: l.boss,
          activeMs: l.activeMs,
          fruitings: l.fruitings,
          leagueBefore: live.members.get(e.id)?.league ?? 0,
          leagueAfter: leagues.get(e.id)!,
        };
      });
      // M7 rewards: titles and colours of this season, skins and strains of the whole career.
      const best = this.alliances(live).find((a) => a.score > 0);
      const bestPact = best ? live.forest.pacts.find((p) => p.id === best.id) : undefined;
      const allied = bestPact ? [...bestPact.members, ...bestPact.former] : [];
      const given = seasonRewards([...lines.values()], new Map(ranking.map((e) => [e.id, e.rank])), allied, leagues);
      const fresh = new Map<string, Reward[]>();
      const rewards: Array<Reward & { playerId: string }> = [];
      for (const st of standings) {
        const before = await this.store.rewardsOf(st.playerId);
        const career = await this.store.careerOf(st.playerId);
        const all = [...(given.get(st.playerId) ?? []), ...careerRewards({ seasons: career.seasons + 1, fruitings: career.fruitings + st.fruitings, trophies: career.trophies + st.trophies })];
        const mine: Reward[] = [];
        for (const r of all) {
          if (before.some((b) => b.kind === r.kind && b.id === r.id) || mine.some((m) => m.kind === r.kind && m.id === r.id)) continue;
          mine.push(r);
          rewards.push({ ...r, playerId: st.playerId });
        }
        fresh.set(st.playerId, mine);
      }
      await live.saving;
      await this.store.endForest(live.record.id, standings, season.end, rewards);
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
              conquests: mine.conquests,
              boss: mine.boss,
              activeMs: mine.activeMs,
              league: { before: mine.leagueBefore, after: mine.leagueAfter },
              rewards: fresh.get(id) ?? [],
            }
          : null;
        for (const c of clients) c.send({ type: "seasonEnded", result });
      }
      this.forests.delete(live.record.id);
      for (const id of live.forest.players.keys()) {
        this.playerForest.delete(id);
        const a = live.members.get(id);
        if (a) a.league = leagues.get(id) ?? a.league;
      }
    }
    return ended;
  }

  private comeBack(live: LiveForest, player: GameState, now: number): AwaySummary | undefined {
    const since = player.lastSeenAt;
    const mark = live.away.get(player.id);
    live.away.delete(player.id);
    const journal = this.journalLines(live, player.id);
    live.journal.delete(player.id);
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
      journal,
    };
  }

  private liveOf(playerId: string): LiveForest | undefined {
    // M9: an admin playing in a test forest.
    const test = this.playing.get(playerId);
    if (test) {
      const live = this.forests.get(test);
      if (live?.forest.players.has(playerId)) return live;
      this.playing.delete(playerId);
    }
    const id = this.playerForest.get(playerId);
    return id ? this.forests.get(id) : undefined;
  }

  /**
   * The player's forest. A newcomer of the week joins the forest with room whose league is closest to
   * theirs (the oldest first), or a new forest of their league once every forest is full (M7).
   */
  private async forestOf(account: Account): Promise<LiveForest | null> {
    const existing = this.liveOf(account.id);
    if (existing) return existing;
    const now = this.now();
    const season = seasonAt(now);
    const last = (await this.store.seasonHistory(account.id, 1))[0] ?? null;
    // M7: every two weeks without playing cost a league.
    if (last) {
      const missed = Math.round((season.start - last.seasonStart) / (7 * 86_400_000)) - 1;
      const league = leagueAfterAbsence(account.league, missed);
      if (league !== account.league) {
        account.league = league;
        await this.store.setLeague(account.id, league);
      }
    }
    let live = [...this.forests.values()]
      .filter((f) => !f.test && f.record.seasonStart === season.start && freeSlices(f.forest).length > 0)
      .sort((a, b) => Math.abs(a.record.league - account.league) - Math.abs(b.record.league - account.league) || a.record.number - b.record.number)[0];
    live ??= await this.createForest(account.league);
    const player = joinForest(live.forest, account.id, now);
    if (!player) return null;
    // GDD §8.2: Monday bonus from last week's rank in their forest.
    const previousStart = seasonAt(season.start - 1).start;
    const previous = last && last.seasonStart === previousStart ? last : null;
    player.mondayBonus = mondayBonusFor(previous);
    live.members.set(account.id, account);
    this.playerForest.set(account.id, live.record.id);
    this.broadcastRoster(live);
    this.save(live);
    await live.saving;
    return live;
  }

  private createForest(league: number): Promise<LiveForest> {
    let pending = this.creating.get(league);
    if (!pending) {
      pending = (async () => {
        const now = this.now();
        const forest = newForest(randomSeed(), now, this.capacity);
        const record = await this.store.createForest(forest, seasonAt(now).start, league);
        this.log(`created forest #${record.number} (league ${league})`);
        return this.adopt(record, forest, new Map());
      })().finally(() => this.creating.delete(league));
      this.creating.set(league, pending);
    }
    return pending;
  }

  private adopt(record: ForestRecord, forest: ForestState, members: Map<string, Account>, test: TestForest | null = null, clock: Clock = this.clock): LiveForest {
    const live: LiveForest = {
      clock,
      lastTick: Math.max(forest.updatedAt, this.clockNow(clock)),
      savedAt: this.realNow(),
      test,
      actions: [],
      spectators: new Map(),
      record,
      forest,
      members,
      clients: new Map(),
      won: new Map(),
      lost: new Map(),
      away: new Map(),
      journal: new Map(),
      alerts: new Map(),
      attackAlerted: new Map(),
      seasonEndNotified: false,
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
    if (live.test) return; // Test forests (M9) live in memory only.
    live.savedAt = this.realNow();
    live.saving = live.saving
      .then(() => this.store.saveForest(live.record.id, live.forest))
      .catch((err: unknown) => this.log(`save failed for forest #${live.record.number}: ${String(err)}`));
  }
}

/** A stored message as sent to players (the pact id stays on the server). */
function publicChat(m: StoredChat): ChatMessage {
  const { pact: _pact, ...message } = m;
  return message;
}

function countTiles(forest: ForestState, playerId: string): number {
  let n = 0;
  for (const t of forest.tiles.values()) if (t.owner === playerId) n++;
  return n;
}

function pushAlert(live: LiveForest, playerId: string, alert: Alert): void {
  push(live.alerts, playerId, alert);
}

/** What a stretch of simulation produced that players must be told. */
interface StepOutcome {
  notices: Map<string, CaptureNotice[]>;
  happenings: ReturnType<typeof resolveEvents>;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
