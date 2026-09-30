import {
  act,
  advance,
  advanceForest,
  botPlay,
  build,
  chooseStrain,
  buySporeUpgrade,
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
} from "@mycelium/shared";
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
  /** Names of the accounts that may cut other players' chat (M7 moderation). */
  admins?: readonly string[];
  log?: (msg: string) => void;
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
    // The session's account is fresh (an admin may have silenced it since the forest was loaded).
    live.members.set(account.id, account);
    const muted = new Set(await this.store.mutedBy(account.id));
    this.mutes.set(account.id, muted);
    const chat = await this.chatFor(live, account.id, muted);
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
      forestEvents: this.eventsFor(live, account.id),
      roster: this.roster(live),
      chat,
      muted: [...muted],
      silencedUntil: account.silencedUntil,
      admin: this.admins.has(account.name.toLowerCase()),
      social: this.socialOf(live, account.id, now),
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
      at: this.now(),
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
      return { id, name: o.name, color: o.color };
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
    if (!this.push.publicKey || (live.clients.get(playerId)?.size ?? 0) > 0 || live.members.get(playerId)?.isBot) return;
    const now = this.now();
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
        this.pactEvents(live, resolvePacts(live.forest, now));
        const before = new Map<string, string>();
        for (const [k, t] of live.forest.tiles) if (t.capture) before.set(k, t.capture.by);
        const events = resolveBorders(live.forest, dt, now);
        this.alertAttacks(live, before, now);
        const happenings = resolveEvents(live.forest, dt, now);
        for (const h of happenings) {
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
        const season = seasonAt(live.record.seasonStart);
        if (!live.seasonEndNotified && now >= season.freezeAt - 3_600_000 && now < season.freezeAt) {
          live.seasonEndNotified = true;
          for (const id of live.forest.players.keys()) this.notify(live, id, "seasonEnd");
        }
        const notices = new Map<string, CaptureNotice[]>();
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
        for (const [id, account] of live.members) {
          if (account.isBot) {
            const bot = live.forest.players.get(id)!;
            botPlay(bot, now, Math.floor(now / BOT_SESSION_MS) !== Math.floor((now - dt) / BOT_SESSION_MS));
            const used = botAct(live.forest, bot, now);
            // Tell the victim, as for a human caster.
            if (used) this.recordAction(live, used.victim, used.action, id, used.q, used.r);
            this.pactEvents(live, botDiplomacy(live.forest, bot, now));
          }
        }
        await this.scores.publish(
          live.record.seasonStart,
          live.record.id,
          [...live.forest.players.values()].map((p) => [p.id, p.biomass] as const),
        );
        for (const [id, clients] of live.clients) {
          if (clients.size === 0) {
            live.alerts.delete(id);
            continue;
          }
          const player = live.forest.players.get(id)!;
          const { game, owners } = this.view(live, player);
          const board = await this.leaderboard(live, id);
          for (const c of clients) {
            c.send({
              type: "state",
              game,
              owners,
              serverTime: now,
              events: notices.get(id) ?? [],
              forestEvents: this.eventsFor(live, id),
              eventNotices: eventNotices(happenings, id),
              alerts: live.alerts.get(id) ?? [],
              social: this.socialOf(live, id, now),
            });
            c.send({ type: "leaderboard", leaderboard: board });
          }
        }
        live.alerts.clear();
        if (this.ticks % SAVE_EVERY_TICKS === 0) this.save(live);
      }),
    );
  }

  /** For tests and diagnostics. */
  forestState(playerId: string): ForestState | undefined {
    return this.liveOf(playerId)?.forest;
  }

  // -------------------------------------------------------------------------

  private act_(playerId: string, client: GameClient, action: (p: GameState, now: number, forest: ForestState) => ActionResult): void {
    const live = this.liveOf(playerId);
    if (!live || !live.clients.get(playerId)?.has(client)) {
      client.send({ type: "actionError", error: "not_authenticated" });
      return;
    }
    const now = this.now();
    advanceForest(live.forest, now);
    const player = live.forest.players.get(playerId)!;
    const result = action(player, now, live.forest);
    if (!result.ok) {
      client.send({ type: "actionError", error: result.error });
      return;
    }
    advance(player, now);
    refreshToxins(live.forest); // Toxines and captures change the neighbours' tiles.
    const { game, owners } = this.view(live, player);
    const forestEvents = this.eventsFor(live, playerId);
    const social = this.socialOf(live, playerId, now);
    for (const c of live.clients.get(playerId)!) c.send({ type: "state", game, owners, serverTime: now, events: [], forestEvents, eventNotices: [], alerts: [], social });
  }

  /** What a player sees: their game, the tiles near their network, and who owns them. */
  private view(live: LiveForest, player: GameState): { game: ReturnType<typeof toSnapshot>; owners: OwnerInfo[] } {
    const visible = visibleKeys(live.forest, player.id);
    const game = toSnapshot(player, visible);
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
    };
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
    this.broadcastRoster(live);
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

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
