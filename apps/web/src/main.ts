import {
  ACTION_IDS,
  ACTIONS,
  actionPrice,
  ANTI_FRUSTRATION,
  activeEffect,
  effectsAt,
  inForestCentre,
  advance,
  biomassRate,
  checkBuild,
  checkBuyUpgrade,
  checkColonize,
  checkMoveHeart,
  colonizationCost,
  enzymeRate,
  glandRate,
  earnedMutationPoints,
  AUTOMATION,
  automationUnlocked,
  canColonizeTerrain,
  checkBuySporeUpgrade,
  checkFructify,
  FRUITING,
  fruitingPreview,
  growthTimeFactor,
  SPORE_UPGRADE_IDS,
  sporeUpgradeCost,
  MUTATION_BRANCHES,
  mutationPlace,
  mutationPoints,
  mutationThreshold,
  STRAIN_IDS,
  fromSnapshot,
  GAME_NAME,
  growingTiles,
  growthDurationMs,
  heartReadyAt,
  HUMIDITY,
  humidity,
  mondayBonusFor,
  hexEquals,
  hexKey,
  hexNeighbors,
  networkHops,
  phaseAt,
  richness,
  ROOTS,
  STRUCTURE_IDS,
  structureCost,
  TERRAIN_STATS,
  ownedCount,
  productionRate,
  QUEUE_MAX,
  queueIndex,
  seasonAt,
  tileProduction,
  tileYield,
  TRANSPORT,
  transportLoss,
  UPGRADE_IDS,
  upgradeCost,
  type AwaySummary,
  type CaptureNotice,
  type ClientMessage,
  type GameSnapshot,
  type Leaderboard,
  type LeaderboardEntry,
  type OwnerInfo,
  type SeasonResult,
  type GameState,
  type Hex,
  type ServerMessage,
  type Terrain,
  type ActionId,
  type Tile,
  type EventDto,
  type EventNotice,
  type Alert,
  type JournalLine,
  NEMATODES,
  STORM,
  EVENTS,
} from "@mycelium/shared";
import { cssColor, playerColor } from "./colors";
import { formatDuration, formatNumber } from "./format";
import { applyI18n, lang, locale, onLangChange, setLang, t, type MessageKey } from "./i18n";
import { ChatView } from "./chat-view";
import { MapView } from "./map-view";
import { NotifyView } from "./notify";
import { choosePassword, clearToken, Connection, loadToken, saveToken, signIn, signOut } from "./net";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  nutrients: $("nutrients"),
  enzymesRes: $("enzymes-res"),
  enzymes: $("enzymes"),
  enzymesRate: $("enzymes-rate"),
  tileStructures: $("tile-structures"),
  tabUpgrades: $("tab-upgrades"),
  tabMutations: $("tab-mutations"),
  upgradesView: $("upgrades-view"),
  mutationsView: $("mutations-view"),
  strainLine: $("strain-line"),
  mutationPointsLine: $("mutation-points"),
  mutationBranches: $("mutation-branches"),
  strain: $("strain"),
  strainList: $("strain-list"),
  tabSpores: $("tab-spores"),
  sporesView: $("spores-view"),
  sporesLine: $("spores-line"),
  fruitRadius: $("fruit-radius"),
  fruitPreview: $("fruit-preview"),
  fruitGo: $<HTMLButtonElement>("fruit-go"),
  sporeList: $("spore-list"),
  autoColonize: $<HTMLSelectElement>("auto-colonize"),
  autoUpgrades: $<HTMLInputElement>("auto-upgrades"),
  autoNote: $("auto-note"),
  structureList: $("structure-list"),
  tileConflict: $("tile-conflict"),
  eventPanel: $("event-panel"),
  eventList: $("event-list"),
  actionList: $("action-list"),
  nutrientsRate: $("nutrients-rate"),
  biomass: $("biomass"),
  biomassRate: $("biomass-rate"),
  tiles: $("tiles"),
  player: $("player-name"),
  upgradesPanel: $("upgrades"),
  upgradeList: $("upgrade-list"),
  tilePanel: $("tile-panel"),
  tileName: $("tile-name"),
  tileStatus: $("tile-status"),
  tileFacts: $("tile-facts"),
  tileNote: $("tile-note"),
  tileActions: $("tile-actions"),
  queue: $("queue"),
  away: $("away"),
  awayTitle: $("away-title"),
  awayList: $("away-list"),
  awayReduced: $("away-reduced"),
  hint: $("hint"),
  toast: $("toast"),
  status: $("status"),
  auth: $("auth"),
  authForm: $<HTMLFormElement>("auth-form"),
  authName: $<HTMLInputElement>("auth-name"),
  authPassword: $<HTMLInputElement>("auth-password"),
  authError: $("auth-error"),
  authSubmit: $<HTMLButtonElement>("auth-submit"),
  tabLogin: $("tab-login"),
  tabRegister: $("tab-register"),
  password: $("password"),
  passwordForm: $<HTMLFormElement>("password-form"),
  newPassword: $<HTMLInputElement>("new-password"),
  passwordError: $("password-error"),
  forestLabel: $("forest-label"),
  trophies: $("trophies"),
  miniBoard: $("mini-board"),
  miniBoardRank: $("mini-board-rank"),
  miniBoardRows: $("mini-board-rows"),
  board: $("board"),
  boardGlobal: $("board-global"),
  boardRows: $("board-rows"),
  history: $("history"),
  phase: $("phase"),
  phaseName: $("phase-name"),
  phaseDesc: $("phase-desc"),
  phaseClock: $("phase-clock"),
  seasonEnd: $("season-end"),
};

let game: GameState | null = null;
/** Server clock at the last message, the local time it arrived, and the game speed (local testing). */
let clock = { server: 0, local: 0, scale: 1 };
let owners = new Map<string, OwnerInfo>();
/** Events announced or under way in the forest (GDD §7). */
let forestEvents: EventDto[] = [];
/** Season whose last-hour alert was shown. */
let seasonEndAlerted = 0;
let board: Leaderboard | null = null;
let forestNumber = 0;
let history: SeasonResult[] = [];
let lastResult: SeasonResult | null = null;
let token: string | null = loadToken();
let authMode: "login" | "register" = "register";
let selected: Hex | null = null;
let connection: Connection | null = null;
let mapView: MapView | null = null;
/** Whether Enzymes were unlocked at the last snapshot, to announce the unlock once. */
let enzymesKnown: boolean | null = null;
/** The player closed the strain picker with "later" in this session. */
let strainDeferred = false;
/** Tiles kept around the Cœur when fruiting. */
let fruitRadius = 3;
/** The fruiting button waits for a second click until this time. */
let fruitConfirmUntil = 0;
let panelTab: "upgrades" | "mutations" | "spores" = "upgrades";

const serverNow = () => clock.server + (Date.now() - clock.local) * clock.scale;
const fmt = (n: number) => formatNumber(n, locale());

// Chat and browser notifications (M7)
const chat = new ChatView(
  {
    panel: $("chat-panel"),
    toggle: $("chat-toggle"),
    badge: $("chat-badge"),
    channel: $<HTMLSelectElement>("chat-channel"),
    list: $("chat-list"),
    form: $<HTMLFormElement>("chat-form"),
    input: $<HTMLInputElement>("chat-input"),
    note: $("chat-note"),
  },
  { send: (msg) => connection?.send(msg), toast: (text, tone) => toast(text, tone) },
);
$("chat-close").addEventListener("click", () => chat.setOpen(false));
const notify = new NotifyView(
  { overlay: $("notify"), kinds: $("notify-kinds"), status: $("notify-status"), toggle: $<HTMLButtonElement>("notify-toggle") },
  (msg) => connection?.send(msg),
);
notify.render();
$("notify-open").addEventListener("click", () => notify.open());
$("notify-close").addEventListener("click", () => notify.close());

// ---------------------------------------------------------------------------
// Static texts and language

$("brand").textContent = GAME_NAME;
$("auth-brand").textContent = GAME_NAME;
$("version").textContent = t("footer.version", { version: __APP_VERSION__ });
applyI18n(document);
onLangChange(() => {
  applyI18n(document);
  $("version").textContent = t("footer.version", { version: __APP_VERSION__ });
  buildUpgradeList();
  buildMutationList();
  buildStrainList();
  buildSporeList();
  buildAutomation();
  setAuthMode(authMode);
  if (forestNumber) ui.forestLabel.textContent = t("forest.label", { number: forestNumber });
  renderBoard();
  renderHistory();
  if (!ui.seasonEnd.hidden) showSeasonEnd(lastResult);
  chat.refresh();
  notify.render();
  // Notifications are written in the language of the subscription.
  void notify.resubscribe();
  render();
});
$("lang-btn").addEventListener("click", () => setLang(lang() === "en" ? "fr" : "en"));

// ---------------------------------------------------------------------------
// Accounts (pseudo + password)

function showAuth(): void {
  ui.auth.hidden = false;
  setAuthMode(authMode);
  ui.authName.focus();
}

function setAuthMode(mode: "login" | "register"): void {
  authMode = mode;
  ui.authForm.classList.toggle("register", mode === "register");
  ui.tabLogin.setAttribute("aria-selected", String(mode === "login"));
  ui.tabRegister.setAttribute("aria-selected", String(mode === "register"));
  ui.authPassword.autocomplete = mode === "register" ? "new-password" : "current-password";
  ui.authSubmit.textContent = t(mode === "register" ? "auth.submitRegister" : "auth.submitLogin");
}

ui.tabLogin.addEventListener("click", () => setAuthMode("login"));
ui.tabRegister.addEventListener("click", () => setAuthMode("register"));

ui.authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ui.authSubmit.disabled = true;
  ui.authError.hidden = true;
  void signIn(authMode, ui.authName.value.trim(), ui.authPassword.value).then((res) => {
    ui.authSubmit.disabled = false;
    if (!res.ok) {
      ui.authError.textContent = t(`auth.error.${res.error}`);
      ui.authError.hidden = false;
      return;
    }
    token = res.session.token;
    saveToken(token);
    ui.authPassword.value = "";
    ui.auth.hidden = true;
    void startGame(token);
  });
});

ui.passwordForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!token) return;
  ui.passwordError.hidden = true;
  void choosePassword(token, ui.newPassword.value).then((ok) => {
    if (!ok) {
      ui.passwordError.textContent = t("auth.error.weak_password");
      ui.passwordError.hidden = false;
      return;
    }
    ui.newPassword.value = "";
    ui.password.hidden = true;
    toast(t("password.done"));
  });
});
$("password-later").addEventListener("click", () => (ui.password.hidden = true));

$("logout-btn").addEventListener("click", () => {
  const old = token;
  leaveGame();
  if (old) void signOut(old);
});

/** Back to the sign-in screen (signed out, or the saved session no longer exists). */
function leaveGame(): void {
  connection?.stop();
  connection = null;
  token = null;
  game = null;
  clearToken();
  document.body.classList.remove("in-game");
  setStatus(null);
  showAuth();
}

// ---------------------------------------------------------------------------
// Game

async function startGame(token: string): Promise<void> {
  if (!mapView) {
    mapView = new MapView();
    await mapView.init($("map"), serverNow, selectTile);
  }
  setStatus("status.connecting");
  connection = new Connection(token, {
    onMessage,
    onStatus: (connected) => setStatus(connected ? null : "status.reconnecting"),
  });
  connection.start();
}

function onMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "ready":
      document.body.classList.add("in-game");
      ui.player.textContent = msg.player.name;
      forestNumber = msg.forest.number;
      ui.forestLabel.textContent = t("forest.label", { number: forestNumber });
      clock.scale = msg.timeScale;
      history = msg.history;
      renderHistory();
      setForestEvents(msg.forestEvents ?? []);
      applySnapshot(msg.game, msg.owners, msg.serverTime);
      chat.load({ me: msg.player.id, admin: msg.admin, silencedUntil: msg.silencedUntil, roster: msg.roster, chat: msg.chat, muted: msg.muted });
      void notify.resubscribe();
      if (msg.away) showAway(msg.away);
      if (msg.needsPassword) ui.password.hidden = false;
      break;
    case "roster":
      chat.setRoster(msg.roster);
      break;
    case "chat":
      chat.receive(msg.message);
      break;
    case "chatError":
      chat.error(msg.error);
      break;
    case "chatNotice":
      toast(msg.notice === "reported" ? t("chat.notice.reported") : t("chat.notice.silenced", { name: msg.name ?? "?" }), "good");
      break;
    case "state":
      setForestEvents(msg.forestEvents ?? []);
      applySnapshot(msg.game, msg.owners, msg.serverTime);
      for (const e of msg.events) announce(e);
      for (const n of msg.eventNotices ?? []) announceEvent(n);
      for (const a of msg.alerts ?? []) alert(a);
      break;
    case "leaderboard":
      board = msg.leaderboard;
      renderBoard();
      break;
    case "seasonEnded":
      showSeasonEnd(msg.result);
      break;
    case "authError":
      // The saved session no longer exists (signed out elsewhere, or a local server without database restarted).
      leaveGame();
      break;
    case "actionError":
      toast(t(`error.${msg.error}`));
      break;
  }
}

function applySnapshot(snapshot: GameSnapshot, list: OwnerInfo[], serverTime: number): void {
  clock = { server: serverTime, local: Date.now(), scale: clock.scale };
  for (const o of list) owners.set(o.id, o);
  game = fromSnapshot(snapshot);
  if (enzymesKnown === false && game.enzymesUnlocked) toast(t("enzymes.unlocked"), "good");
  enzymesKnown = game.enzymesUnlocked;
  mapView?.setGame(game, list);
  if (!ui.upgradeList.childElementCount) buildUpgradeList();
  if (!ui.mutationBranches.childElementCount) buildMutationList();
  if (!ui.strainList.childElementCount) buildStrainList();
  if (!ui.sporeList.childElementCount) buildSporeList();
  if (!ui.autoColonize.childElementCount) buildAutomation();
  render();
}

function announce(e: CaptureNotice): void {
  const name = owners.get(e.other)?.name ?? "?";
  const key: MessageKey = e.heart ? (e.kind === "won" ? "capture.heartWon" : "capture.heartLost") : e.kind === "won" ? "capture.won" : "capture.lost";
  toast(t(key, { name }), e.kind === "won" ? "good" : "bad");
}

function alert(a: Alert): void {
  const name = owners.get(a.by)?.name ?? "?";
  if (a.type === "attacked") toast(t(a.heart ? "alert.heart" : "alert.attacked", { name }));
  else toast(t("alert.action", { name, action: t(`action.${a.action}.name`) }));
}

function journalText(line: JournalLine): string {
  switch (line.type) {
    case "heartLost":
      return t("journal.heartLost", { name: line.name });
    case "lostTo":
      return t("journal.lostTo", { name: line.name, tiles: line.tiles });
    case "wonFrom":
      return t("journal.wonFrom", { name: line.name, tiles: line.tiles });
    case "action":
      return t("journal.action", { name: line.name, action: t(`action.${line.action}.name`), count: line.count });
    case "event": {
      const event = t(`event.${line.kind}`);
      const parts: string[] = [];
      if (line.tiles > 0) parts.push(t("journal.eventLost", { event, tiles: line.tiles }));
      if (line.biomass > 0) {
        const reward =
          line.enzymes > 0
            ? t("journal.eventRewardEnzymes", { event, biomass: fmt(line.biomass), enzymes: fmt(line.enzymes) })
            : t("journal.eventReward", { event, biomass: fmt(line.biomass) });
        parts.push(line.trophy ? reward + t("journal.trophy") : reward);
      }
      return parts.join(" · ");
    }
  }
}

function setForestEvents(list: EventDto[]): void {
  forestEvents = list;
  mapView?.setEvents(list);
}

function announceEvent(n: EventNotice): void {
  const name = t(`event.${n.kind}`);
  switch (n.phase) {
    case "announced":
      toast(t("notice.announced", { name }), "good");
      break;
    case "started":
      toast(t("notice.started", { name }), "good");
      break;
    case "lost":
      toast(t("notice.lost", { name, count: n.tiles ?? 0 }));
      break;
    case "reward": {
      const text = (n.enzymes ?? 0) > 0
        ? t("notice.rewardEnzymes", { name, biomass: fmt(n.biomass ?? 0), enzymes: fmt(n.enzymes ?? 0) })
        : t("notice.reward", { name, biomass: fmt(n.biomass ?? 0) });
      toast(n.trophy ? `${text} ${t("notice.trophy")}` : text, "good");
      break;
    }
  }
}

/** Lines of the events panel, kept across renders so that clicks always land (by event id). */
const eventItems = new Map<number, { li: HTMLLIElement; button: HTMLButtonElement }>();

/** The events panel: what is coming and what is under way, most urgent first (GDD §7, §11). */
function renderEvents(now: number): void {
  const list = [...forestEvents].sort((a, b) => (a.status === b.status ? a.startsAt - b.startsAt : a.status === "active" ? -1 : 1));
  ui.eventPanel.hidden = list.length === 0;
  document.body.classList.toggle("has-events", list.length > 0);
  const ids = new Set(list.map((e) => e.id));
  for (const [id, item] of eventItems) {
    if (!ids.has(id)) {
      item.li.remove();
      eventItems.delete(id);
    }
  }
  list.forEach((e, i) => {
    let item = eventItems.get(e.id);
    if (!item) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => {
        const current = forestEvents.find((x) => x.id === e.id);
        if (current) {
          selectTile({ q: current.q, r: current.r });
          mapView?.centerOn({ q: current.q, r: current.r });
        }
      });
      li.append(button);
      item = { li, button };
      eventItems.set(e.id, item);
    }
    const name = t(`event.${e.kind}`);
    let text: string;
    if (e.status === "announced") text = t("event.in", { name, time: formatDuration(e.startsAt - now) });
    else if (e.life !== undefined) text = t("event.life", { name, life: percent(e.life), share: percent(e.share ?? 0) });
    else text = t("event.active", { name, time: formatDuration(e.endsAt - now) });
    item.li.classList.toggle("active", e.status === "active");
    if (item.button.textContent !== text) item.button.textContent = text;
    const title = eventDescription(e);
    if (item.button.title !== title) item.button.title = title;
    if (ui.eventList.children[i] !== item.li) ui.eventList.insertBefore(item.li, ui.eventList.children[i] ?? null);
  });
}

function eventDescription(e: EventDto): string {
  const strength = e.strong ? EVENTS.centreStrength : 1;
  const desc = t(`event.${e.kind}.desc`, {
    bonus: Math.round(STORM.bonus * strength * 100),
    minutes: Math.round(NEMATODES.biteMs / strength / 60_000),
  });
  return e.strong ? `${desc} (${t("event.strong")})` : desc;
}

function selectTile(h: Hex | null): void {
  selected = h;
  mapView?.select(h);
  document.body.classList.toggle("tile-open", h !== null);
  if (h && window.matchMedia("(max-width: 760px)").matches) setUpgradesOpen(false);
  render();
}

// Leaderboard (GDD §8.1, §11: mini-leaderboard always visible)

function boardRow(e: LeaderboardEntry): string[] {
  return [String(e.rank), owners.get(e.id)?.name ?? e.name, fmt(e.biomass), String(e.tiles), String(e.trophies)];
}

function swatch(id: string): HTMLElement {
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = game && id === game.id ? "var(--glow)" : cssColor(playerColor(owners.get(id)?.color ?? 0));
  return sw;
}

function renderBoard(): void {
  if (!board) return;
  const me = game?.id;
  ui.miniBoardRank.textContent = t("board.rank", { rank: board.rank, players: board.players });
  ui.miniBoardRows.replaceChildren(
    ...board.around.map((e) => {
      const li = document.createElement("li");
      li.classList.toggle("me", e.id === me);
      const rank = document.createElement("span");
      rank.textContent = `${e.rank}.`;
      const name = document.createElement("span");
      name.textContent = e.name;
      const score = document.createElement("span");
      score.className = "num";
      score.textContent = fmt(e.biomass);
      li.append(rank, swatch(e.id), name, score);
      return li;
    }),
  );
  ui.boardGlobal.textContent = t("board.global", { rank: board.global.rank, players: board.global.players });
  const rows = [...board.top];
  for (const e of board.around) if (!rows.some((r) => r.id === e.id)) rows.push(e);
  ui.boardRows.replaceChildren(
    ...rows.map((e) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("me", e.id === me);
      boardRow(e).forEach((v, i) => {
        const td = document.createElement("td");
        if (i === 1) td.append(swatch(e.id), " ");
        td.append(v);
        if (i >= 2) td.className = "num";
        tr.append(td);
      });
      return tr;
    }),
  );
}

ui.miniBoard.addEventListener("click", () => (ui.board.hidden = false));
$("board-close").addEventListener("click", () => (ui.board.hidden = true));

// Seasons (GDD §7, §8.2): weekly phases, the Sunday freeze, then the wipe and a new forest.

function renderHistory(): void {
  if (history.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = t("history.empty");
    ui.history.replaceChildren(li);
    return;
  }
  ui.history.replaceChildren(
    ...history.map((r) => {
      const li = document.createElement("li");
      li.textContent = t("history.row", { week: r.week, forest: r.forestNumber, rank: r.rank, players: r.players, biomass: fmt(r.biomass) });
      const seed = document.createElement("small");
      seed.className = "mono";
      seed.textContent = t("history.seed", { seed: r.seed });
      li.append(seed);
      return li;
    }),
  );
}

/** Days and hours above a day, then the usual short format. */
function formatLong(ms: number): string {
  if (ms < 86_400_000) return formatDuration(ms);
  const hours = Math.floor(ms / 3_600_000);
  return t("time.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
}

function renderPhase(g: GameState): void {
  ui.phase.hidden = !g.calendar;
  if (!g.calendar) return;
  const now = serverNow();
  const phase = phaseAt(now);
  const season = seasonAt(now);
  // GDD §11: "fin de saison dans 1 h".
  if (!phase.frozen && season.freezeAt - now <= 3_600_000 && seasonEndAlerted !== season.start) {
    seasonEndAlerted = season.start;
    toast(t("alert.seasonEnd"), "good");
  }
  ui.phase.classList.toggle("frozen", phase.frozen);
  ui.phaseName.textContent = t("phase.title", {
    day: t(`day.${phase.index}` as MessageKey),
    phase: t(`phase.${phase.id}.name` as MessageKey),
  });
  let desc = t(`phase.${phase.id}.desc` as MessageKey);
  if (phase.id === "germination" && g.mondayBonus > 0) desc += ` · ${t("season.mondayBonus", { bonus: Math.round(g.mondayBonus * 100) })}`;
  ui.phaseDesc.textContent = desc;
  ui.phaseClock.textContent = phase.frozen
    ? t("season.frozen")
    : `${t("season.week", { week: season.week })} · ${t("season.endsIn", { time: formatLong(season.freezeAt - now) })}`;
}

function showSeasonEnd(result: SeasonResult | null): void {
  lastResult = result;
  // Without a result (no forest this week), the season that just ended is the one an hour ago.
  const week = result?.week ?? seasonAt(serverNow() - 3_600_000).week;
  $("season-end-week").textContent = t("season.week", { week });
  $("season-end-title").textContent = t("seasonEnd.title", { week });
  $("season-end-rank").textContent = result
    ? t("seasonEnd.rank", { rank: result.rank, players: result.players, forest: result.forestNumber })
    : t("seasonEnd.none");
  const stats = $("season-end-stats");
  stats.hidden = !result;
  if (result) stats.textContent = t("seasonEnd.stats", { biomass: fmt(result.biomass), tiles: result.tiles, trophies: result.trophies });
  const seed = $("season-end-seed");
  seed.hidden = !result;
  if (result) seed.textContent = t("seasonEnd.seed", { seed: result.seed });
  const bonus = Math.round(mondayBonusFor(result) * 100);
  const bonusLine = $("season-end-bonus");
  bonusLine.hidden = bonus === 0;
  bonusLine.textContent = t("seasonEnd.bonus", { bonus });
  ui.seasonEnd.hidden = false;
}

$("season-end-next").addEventListener("click", () => {
  ui.seasonEnd.hidden = true;
  ui.board.hidden = true;
  strainDeferred = false;
  selectTile(null);
  // The old forest is gone: reconnect and the server places the player in a forest of the new season.
  connection?.stop();
  connection = null;
  game = null;
  board = null;
  if (token) void startGame(token);
});

// Two persistent buttons whose action is set on each render (rebuilding them would eat clicks).
const actionButtons = [0, 1].map(() => {
  const b = document.createElement("button");
  b.type = "button";
  b.addEventListener("click", () => {
    const type = b.dataset.action as "colonize" | "unqueue" | "moveHeart" | undefined;
    if (type && selected) connection?.send({ type, q: selected.q, r: selected.r } satisfies ClientMessage);
  });
  ui.tileActions.append(b);
  return b;
});
// Build list (GDD §4.1): persistent buttons too, updated on each render.
const structureItems = STRUCTURE_IDS.map((id) => {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => {
    if (selected) connection?.send({ type: "build", q: selected.q, r: selected.r, structure: id } satisfies ClientMessage);
  });
  const desc = document.createElement("p");
  desc.className = "structure-desc";
  li.append(button, desc);
  ui.structureList.append(li);
  return { id, li, button, desc };
});
const actionItems = ACTION_IDS.map((id) => {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => {
    if (selected) connection?.send({ type: "act", action: id, q: selected.q, r: selected.r } satisfies ClientMessage);
  });
  const desc = document.createElement("p");
  desc.className = "structure-desc";
  li.append(button, desc);
  ui.actionList.append(li);
  return { id, li, button, desc };
});
const demolishItem = (() => {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.addEventListener("click", () => {
    if (selected) connection?.send({ type: "demolish", q: selected.q, r: selected.r } satisfies ClientMessage);
  });
  li.append(button);
  ui.structureList.append(li);
  return { li, button };
})();

$("away-close").addEventListener("click", () => (ui.away.hidden = true));
$("tile-close").addEventListener("click", () => selectTile(null));
$("zoom-in").addEventListener("click", () => mapView?.zoomBy(1.25));
$("zoom-out").addEventListener("click", () => mapView?.zoomBy(0.8));
$("zoom-home").addEventListener("click", () => mapView?.home());
$("upgrades-toggle").addEventListener("click", () => {
  const open = !ui.upgradesPanel.classList.contains("open");
  if (open) selectTile(null);
  setUpgradesOpen(open);
});

function setUpgradesOpen(open: boolean): void {
  ui.upgradesPanel.classList.toggle("open", open);
  document.body.classList.toggle("upgrades-open", open);
}

// ---------------------------------------------------------------------------
// HUD

function buildUpgradeList(): void {
  ui.upgradeList.replaceChildren(
    ...UPGRADE_IDS.map((id) => {
      const li = document.createElement("li");
      li.className = "upgrade";
      li.dataset.id = id;
      const title = document.createElement("div");
      const name = document.createElement("span");
      name.className = "upgrade-name";
      name.textContent = t(`upgrade.${id}.name` as MessageKey);
      const level = document.createElement("span");
      level.className = "upgrade-level";
      title.append(name, level);
      const desc = document.createElement("div");
      desc.className = "upgrade-desc";
      desc.textContent = t(`upgrade.${id}.desc` as MessageKey);
      const buy = document.createElement("button");
      buy.type = "button";
      buy.addEventListener("click", () => connection?.send({ type: "buyUpgrade", upgrade: id }));
      li.append(title, buy, desc);
      return li;
    }),
  );
}

// Mutations (GDD §4.2) and strains (GDD §4.3)

function setPanelTab(tab: typeof panelTab): void {
  panelTab = tab;
  ui.tabUpgrades.setAttribute("aria-selected", String(tab === "upgrades"));
  ui.tabMutations.setAttribute("aria-selected", String(tab === "mutations"));
  ui.tabSpores.setAttribute("aria-selected", String(tab === "spores"));
  ui.upgradesView.hidden = tab !== "upgrades";
  ui.mutationsView.hidden = tab !== "mutations";
  ui.sporesView.hidden = tab !== "spores";
  render();
}
ui.tabUpgrades.addEventListener("click", () => setPanelTab("upgrades"));
ui.tabMutations.addEventListener("click", () => setPanelTab("mutations"));
ui.tabSpores.addEventListener("click", () => setPanelTab("spores"));

// Fruiting and the Spore shop (GDD §5)

$("fruit-minus").addEventListener("click", () => {
  fruitRadius = Math.max(FRUITING.minRadius, fruitRadius - 1);
  fruitConfirmUntil = 0;
  render();
});
$("fruit-plus").addEventListener("click", () => {
  fruitRadius = Math.min(40, fruitRadius + 1);
  fruitConfirmUntil = 0;
  render();
});
ui.fruitGo.addEventListener("click", () => {
  if (!game) return;
  // Fruiting cannot be undone: the first click asks for confirmation.
  if (Date.now() > fruitConfirmUntil) {
    fruitConfirmUntil = Date.now() + 4000;
    render();
    return;
  }
  fruitConfirmUntil = 0;
  const { spores } = fruitingPreview(game, fruitRadius, serverNow());
  connection?.send({ type: "fructify", radius: fruitRadius });
  toast(t("fruit.done", { spores: fmt(spores) }), "good");
});

const sporeRows = new Map<string, { button: HTMLButtonElement; level: HTMLElement }>();

function buildSporeList(): void {
  sporeRows.clear();
  ui.sporeList.replaceChildren(
    ...SPORE_UPGRADE_IDS.map((id) => {
      const li = document.createElement("li");
      li.className = "upgrade";
      const title = document.createElement("div");
      const name = document.createElement("span");
      name.className = "upgrade-name";
      name.textContent = t(`sporeUpgrade.${id}.name`);
      const level = document.createElement("span");
      level.className = "upgrade-level";
      title.append(name, level);
      const desc = document.createElement("div");
      desc.className = "upgrade-desc";
      desc.textContent = t(`sporeUpgrade.${id}.desc`);
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => connection?.send({ type: "buySporeUpgrade", upgrade: id }));
      li.append(title, button, desc);
      sporeRows.set(id, { button, level });
      return li;
    }),
  );
}

function renderSpores(g: GameState): void {
  ui.tabSpores.textContent = g.spores >= 1 ? `${t("spores.tab")} · ${fmt(g.spores)}` : t("spores.tab");
  ui.sporesLine.textContent = t("spores.line", { spores: fmt(g.spores), count: g.fruitings });
  for (const [id, row] of sporeRows) {
    const level = g.sporeUpgrades[id as (typeof SPORE_UPGRADE_IDS)[number]];
    row.level.textContent = t("upgrades.level", { level });
    row.button.textContent = t("sporeShop.buy", { cost: fmt(sporeUpgradeCost(id as (typeof SPORE_UPGRADE_IDS)[number], level)) });
    row.button.disabled = !checkBuySporeUpgrade(g, id).ok;
  }
  ui.fruitRadius.textContent = t("fruit.radius", { radius: fruitRadius });
  const now = serverNow();
  const preview = fruitingPreview(g, fruitRadius, now);
  const check = checkFructify(g, fruitRadius);
  const kept = ownedCount(g) - preview.lost.length;
  ui.fruitPreview.textContent = !check.ok && check.error === "no_carpophore"
    ? t("fruit.noCarpophore")
    : preview.lost.length === 0
      ? t("fruit.nothing")
      : t("fruit.preview", { kept, lost: preview.lost.length, spores: fmt(preview.spores) });
  const confirming = Date.now() <= fruitConfirmUntil;
  ui.fruitGo.disabled = !check.ok;
  ui.fruitGo.classList.toggle("confirm", confirming && check.ok);
  ui.fruitGo.textContent = confirming && check.ok ? t("fruit.confirm", { lost: preview.lost.length }) : t("fruit.go");
  // Show on the map what fruiting would release while the Spores tab is open.
  const showing = panelTab === "spores" && (ui.upgradesPanel.classList.contains("open") || !window.matchMedia("(max-width: 760px)").matches);
  mapView?.highlight(showing && check.ok ? new Set(preview.lost.map(hexKey)) : null);
}

// Automations (GDD §9)

const AUTO_TERRAINS: Terrain[] = ["litter", "humus", "deadwood", "stump", "roots", "acid", "wetland"];

function buildAutomation(): void {
  const option = (value: string, label: string) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  };
  ui.autoColonize.replaceChildren(
    option("off", t("auto.off")),
    option("any", t("auto.any")),
    ...AUTO_TERRAINS.map((terrain) => option(terrain, t("auto.prefer", { terrain: t(`terrain.${terrain}`) }))),
  );
}

ui.autoColonize.addEventListener("change", () => {
  const v = ui.autoColonize.value;
  connection?.send({ type: "setAutomation", colonize: v === "off" ? null : v });
});
ui.autoUpgrades.addEventListener("change", () => connection?.send({ type: "setAutomation", upgrades: ui.autoUpgrades.checked }));

function renderAutomation(g: GameState): void {
  const unlocked = automationUnlocked(g);
  ui.autoColonize.disabled = !unlocked.colonize;
  ui.autoUpgrades.disabled = !unlocked.upgrades;
  if (document.activeElement !== ui.autoColonize) ui.autoColonize.value = g.automation.colonize ?? "off";
  ui.autoUpgrades.checked = g.automation.upgrades;
  for (const o of ui.autoColonize.options) if (o.value === "wetland") o.hidden = !canColonizeTerrain(g, "wetland");
  ui.autoNote.textContent = !unlocked.colonize
    ? t("auto.lockedColonize", { value: fmt(AUTOMATION.colonizeAt) })
    : !unlocked.upgrades
      ? t("auto.lockedUpgrades", { value: fmt(AUTOMATION.upgradesAt) })
      : t("auto.ready");
}

const mutationRows = new Map<string, { li: HTMLElement; button: HTMLButtonElement }>();

function buildMutationList(): void {
  mutationRows.clear();
  ui.mutationBranches.replaceChildren(
    ...(Object.keys(MUTATION_BRANCHES) as Array<keyof typeof MUTATION_BRANCHES>).map((branch) => {
      const section = document.createElement("section");
      section.className = "branch";
      const title = document.createElement("h3");
      title.textContent = t(`branch.${branch}.name`);
      const desc = document.createElement("p");
      desc.textContent = t(`branch.${branch}.desc`);
      const list = document.createElement("ul");
      for (const id of MUTATION_BRANCHES[branch]) {
        const li = document.createElement("li");
        li.className = "upgrade mutation";
        const name = document.createElement("span");
        name.className = "upgrade-name";
        name.textContent = t(`mutation.${id}.name`);
        const text = document.createElement("div");
        text.className = "upgrade-desc";
        text.textContent = t(`mutation.${id}.desc`);
        const button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => connection?.send({ type: "mutate", mutation: id }));
        li.append(name, button, text);
        list.append(li);
        mutationRows.set(id, { li, button });
      }
      section.append(title, desc, list);
      return section;
    }),
  );
}

function renderMutations(g: GameState): void {
  const points = mutationPoints(g);
  ui.tabMutations.textContent = points > 0 ? t("mutations.tab", { points }) : t("mutations.title");
  ui.tabMutations.classList.toggle("attention", points > 0);
  ui.mutationPointsLine.textContent = t("mutations.points", { points, next: fmt(mutationThreshold(earnedMutationPoints(g.biomass) + 1)) });
  ui.strainLine.textContent = g.strain
    ? t("strain.current", { name: t(`strain.${g.strain}.name`), desc: t(`strain.${g.strain}.desc`) })
    : t("strain.none");
  for (const [id, row] of mutationRows) {
    const owned = g.mutations.includes(id as never);
    const { requires } = mutationPlace(id as never);
    const locked = !owned && requires !== null && !g.mutations.includes(requires);
    row.li.classList.toggle("owned", owned);
    row.li.classList.toggle("locked", locked);
    row.button.textContent = owned ? t("mutations.owned") : locked ? t("mutations.locked") : t("mutations.take");
    row.button.disabled = owned || locked || points < 1;
  }
}

function buildStrainList(): void {
  ui.strainList.replaceChildren(
    ...STRAIN_IDS.map((id) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const name = document.createElement("span");
      name.className = "strain-name";
      name.textContent = t(`strain.${id}.name`);
      const desc = document.createElement("span");
      desc.className = "strain-desc";
      desc.textContent = t(`strain.${id}.desc`);
      button.append(name, desc);
      button.addEventListener("click", () => {
        connection?.send({ type: "chooseStrain", strain: id });
        ui.strain.hidden = true;
      });
      li.append(button);
      return li;
    }),
  );
}

$("strain-later").addEventListener("click", () => {
  strainDeferred = true;
  ui.strain.hidden = true;
});

function render(): void {
  if (!game) return;
  const rate = productionRate(game);
  ui.nutrients.textContent = fmt(game.nutrients);
  ui.nutrientsRate.textContent = t("res.perSecond", { value: fmt(rate) });
  ui.biomass.textContent = fmt(game.biomass);
  ui.biomassRate.textContent = t("res.perSecond", { value: fmt(biomassRate(game)) });
  ui.enzymesRes.hidden = !game.enzymesUnlocked;
  if (game.enzymesUnlocked) {
    ui.enzymes.textContent = fmt(game.enzymes);
    ui.enzymesRate.textContent = t("tile.enzymesValue", { value: fmt(enzymeRate(game) * 3600) });
  }
  ui.tiles.textContent = String(ownedCount(game));
  ui.queue.textContent = `${game.queue.length}/${QUEUE_MAX}`;
  ui.trophies.textContent = String(game.trophies);
  renderPhase(game);
  renderEvents(serverNow());
  renderMutations(game);
  renderSpores(game);
  renderAutomation(game);
  ui.strain.hidden = strainDeferred || game.strain !== null || ownedCount(game) > 1;

  for (const li of ui.upgradeList.children) {
    const id = (li as HTMLElement).dataset.id!;
    if (!(UPGRADE_IDS as readonly string[]).includes(id)) continue;
    const level = game.upgrades[id as (typeof UPGRADE_IDS)[number]];
    li.querySelector(".upgrade-level")!.textContent = t("upgrades.level", { level });
    const buy = li.querySelector("button")!;
    buy.textContent = t("upgrades.buy", { cost: fmt(upgradeCost(id as (typeof UPGRADE_IDS)[number], level)) });
    buy.disabled = !checkBuyUpgrade(game, id).ok;
  }

  renderTile(game);
}

interface TileAction {
  label: string;
  action: "colonize" | "unqueue" | "moveHeart";
  disabled: boolean;
  primary: boolean;
}

function renderTile(g: GameState): void {
  const tile = selected ? g.tiles.get(hexKey(selected)) : undefined;
  ui.tilePanel.hidden = !tile;
  ui.hint.hidden = Boolean(tile) || ownedCount(g) > 3;
  if (!tile) return;

  const now = serverNow();
  const hops = networkHops(g);
  const wet = humidity(g, tile) > 1;
  const facts: Array<[MessageKey, string]> = [];
  const actions: TileAction[] = [];
  let status = "";
  let tone: "good" | "warn" | "" = "";
  let note = "";
  let buildable = false;

  if (tile.terrain === "wetland") {
    note = t("tile.wetland");
  } else if (tile.owner !== null && tile.owner !== g.id) {
    // Another colony's tile: who holds it, and how the border fight goes.
    const holder = owners.get(tile.owner)?.name ?? "?";
    status = t("tile.ownerOther", { name: holder });
    if (tile.capture) {
      const pct = new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(tile.capture.progress);
      status =
        tile.capture.by === g.id
          ? t("tile.attacking", { percent: pct })
          : t("tile.underAttack", { name: owners.get(tile.capture.by)?.name ?? "?", percent: pct });
    }
    facts.push(["tile.yield", t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades) * richness(g, tile)) })]);
    if (tile.structure) facts.push(["tile.structure", t(`structure.${tile.structure}.name`)]);
    const theirs = owners.get(tile.owner)?.tiles ?? Infinity;
    note =
      theirs <= ANTI_FRUSTRATION.floorTiles
        ? t("tile.floorNote")
        : ownedCount(g) >= ANTI_FRUSTRATION.bullyRatio * theirs
          ? t("tile.bullyNote")
          : t("tile.border");
  } else if (tile.owner === g.id) {
    tone = "good";
    if (tile.capture) {
      const pct = new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(tile.capture.progress);
      note = t("tile.underAttack", { name: owners.get(tile.capture.by)?.name ?? "?", percent: pct });
    }
    if (tile.growthEndsAt !== null) {
      status = t("tile.growing", { time: formatDuration(tile.growthEndsAt - now) });
    } else if (tile.disconnectedSince !== null) {
      status = t("tile.disconnected", { time: formatDuration(tile.disconnectedSince + TRANSPORT.witherMs - now) });
      tone = "warn";
    } else {
      status = hexEquals(tile, g.heart) ? t("tile.heart") : t("tile.owned");
      if (hexEquals(tile, g.heart) && g.heartShieldUntil !== null && g.heartShieldUntil > now) {
        facts.push(["tile.heartShield", formatDuration(g.heartShieldUntil - now)]);
      }
      facts.push(["tile.production", t("tile.yieldValue", { value: fmt(tileProduction(g, tile, hops)) })]);
      if (tile.structure) facts.push(["tile.structure", t(`structure.${tile.structure}.name`)]);
      if (tile.structure === "gland" && hops.has(hexKey(tile))) facts.push(["tile.enzymes", t("tile.enzymesValue", { value: fmt(glandRate(tile) * 3600) })]);
      facts.push(["tile.exhaustion", percent(tile.exhaustion)]);
      const d = hops.get(hexKey(tile));
      if (d !== undefined && d > 0) facts.push(["tile.transport", t("tile.transportValue", { hops: d, loss: Math.round(transportLoss(d) * 100) })]);
      if (!hexEquals(tile, g.heart)) {
        const check = checkMoveHeart(g, tile, now);
        const cooling = !check.ok && check.error === "heart_cooldown";
        actions.push({
          label: cooling ? t("tile.heartReadyIn", { time: formatDuration(heartReadyAt(g) - now) }) : t("tile.moveHeart"),
          action: "moveHeart",
          disabled: !check.ok,
          primary: false,
        });
      }
    }
    note ||= terrainNote(tile.terrain);
    buildable = hops.has(hexKey(tile)) && tile.growthEndsAt === null;
  } else {
    facts.push(["tile.yield", t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades) * richness(g, tile) * humidity(g, tile)) })]);
    if (tile.exhaustion > 0.005) facts.push(["tile.exhaustion", percent(tile.exhaustion)]);
    const cost = colonizationCost(g, tile, now);
    facts.push(["tile.cost", TERRAIN_STATS[tile.terrain].paidInEnzymes ? t("tile.costEnzymes", { value: fmt(cost) }) : fmt(cost)]);
    facts.push(["tile.growth", formatDuration(growthDurationMs(tile.terrain, g.upgrades, growthTimeFactor(g, now)))]);
    note = terrainNote(tile.terrain);
    const position = queueIndex(g, tile);
    if (position >= 0) {
      status = t("tile.queued", { position: position + 1 });
      actions.push({ label: t("tile.unqueue"), action: "unqueue", disabled: false, primary: false });
    } else {
      const check = checkColonize(g, tile);
      const wallet = TERRAIN_STATS[tile.terrain].paidInEnzymes ? g.enzymes : g.nutrients;
      const immediate = g.queue.length === 0 && growingTiles(g).length === 0 && wallet >= cost;
      actions.push({
        label: immediate ? t("tile.colonize") : t("tile.queueAdd", { count: g.queue.length + 1, max: QUEUE_MAX }),
        action: "colonize",
        disabled: !check.ok,
        primary: true,
      });
      if (!check.ok) status = check.error === "not_adjacent" ? t("tile.notAdjacent") : t(`error.${check.error}`);
    }
  }
  if (wet && tile.terrain !== "wetland") facts.push(["tile.humidity", t("tile.humidityValue", { bonus: Math.round(HUMIDITY.wetlandBonus * 100) })]);
  const effects = tile.effects.filter((e) => e.until > now);
  if (effects.length > 0) {
    facts.push(["tile.effects", effects.map((e) => t("tile.effectValue", { name: t(`effect.${e.kind}`), time: formatDuration(e.until - now) })).join(", ")]);
  }
  if (inForestCentre(g, tile) && tile.terrain !== "wetland" && !note) note = t("tile.centreNote");
  const here = forestEvents.find((e) => e.cells.some((c) => c.q === tile.q && c.r === tile.r));
  if (here) {
    const when = here.status === "announced" ? t("event.in", { name: t(`event.${here.kind}`), time: formatDuration(here.startsAt - now) }) : t(`event.${here.kind}`);
    note = `${when} — ${eventDescription(here)} ${t("event.cap")}`;
  }

  ui.tileName.textContent = t(`terrain.${tile.terrain}`);
  ui.tileStatus.textContent = status;
  ui.tileStatus.hidden = status === "";
  ui.tileStatus.className = `tile-status ${tone}`;
  ui.tileFacts.replaceChildren(
    ...facts.flatMap(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = t(label);
      const dd = document.createElement("dd");
      dd.textContent = value;
      return [dt, dd];
    }),
  );
  renderStructures(g, tile, buildable);
  renderConflict(g, tile, now);
  ui.tileNote.textContent = note;
  ui.tileNote.hidden = note === "";
  actionButtons.forEach((b, i) => {
    const a = actions[i];
    b.hidden = !a;
    if (!a) return;
    b.textContent = a.label;
    b.dataset.action = a.action;
    b.disabled = a.disabled;
    b.className = a.primary ? "primary" : "";
  });
}

function terrainNote(terrain: Terrain): string {
  switch (terrain) {
    case "deadwood":
      return t("tile.deadwoodNote");
    case "stump":
      return t("tile.stumpNote");
    case "roots":
      return t("tile.rootsNote", { bonus: Math.round(ROOTS.networkBonus * 100) });
    case "rock":
      return t("tile.rockNote");
    case "acid":
      return t("tile.acidNote");
    case "carcass":
      return t("tile.carcassNote");
    case "tree":
      return t("tile.treeNote");
    default:
      return "";
  }
}

/** The build list of one of the player's connected tiles (GDD §4.1). */
function renderStructures(g: GameState, tile: { q: number; r: number; structure: string | null }, buildable: boolean): void {
  ui.tileStructures.hidden = !buildable;
  if (!buildable) return;
  const current = tile.structure;
  for (const item of structureItems) {
    const available = item.id !== "gland" || g.enzymesUnlocked;
    item.li.hidden = current !== null || !available;
    if (item.li.hidden) continue;
    const name = t(`structure.${item.id}.name`);
    item.button.textContent = t("tile.build", { name, cost: fmt(structureCost(g, item.id)) });
    item.button.disabled = !checkBuild(g, tile, item.id).ok;
    item.desc.textContent = t(`structure.${item.id}.desc`);
  }
  demolishItem.li.hidden = current === null;
  if (current !== null) demolishItem.button.textContent = t("tile.demolish", { name: t(`structure.${current}.name` as MessageKey) });
}

/**
 * Active actions on another colony's tile (GDD §6.2). The client checks what it can see (adjacency,
 * Enzymes, cooldown, Monday); the server has the last word.
 */
function renderConflict(g: GameState, tile: Tile, now: number): void {
  const enemy = tile.owner !== null && tile.owner !== g.id && tile.growthEndsAt === null;
  const hops = networkHops(g, now);
  const touching = enemy && hexNeighbors(tile).some((n) => hops.has(hexKey(n)));
  ui.tileConflict.hidden = !enemy || !touching || !g.enzymesUnlocked;
  if (ui.tileConflict.hidden) return;
  const noPvp = effectsAt(g, now).captureSpeed === 0;
  const theirs = owners.get(tile.owner!)?.tiles ?? Infinity;
  const bullying = ownedCount(g) >= ANTI_FRUSTRATION.bullyRatio * theirs;
  for (const item of actionItems) {
    const id: ActionId = item.id;
    const name = t(`action.${id}.name`);
    const ready = g.cooldowns[id] ?? -Infinity;
    const cost = actionPrice(id, bullying, inForestCentre(g, tile));
    item.button.textContent = now < ready ? t("tile.actReadyIn", { name, time: formatDuration(ready - now) }) : t("tile.act", { name, cost: fmt(cost) });
    item.button.disabled =
      noPvp ||
      now < ready ||
      g.enzymes < cost ||
      (id === "cut" && tile.structure === "rhizomorph") ||
      (id === "assault" && theirs <= ANTI_FRUSTRATION.floorTiles) ||
      (id === "assault" && activeEffect(tile, "assault", now)?.by === g.id);
    item.desc.textContent = noPvp ? t("error.no_pvp") : t(`action.${id}.desc`, { duration: formatDuration(ACTIONS[id].durationMs) });
  }
}

function percent(x: number): string {
  return new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(x);
}

function showAway(away: AwaySummary): void {
  if (away.awayMs < 60_000) return;
  ui.awayTitle.textContent = t("away.title", { time: formatDuration(away.awayMs) });
  const lines = [t("away.nutrients", { value: fmt(away.nutrients) }), t("away.biomass", { value: fmt(away.biomass) })];
  if (away.colonized > 0) lines.push(t("away.colonized", { count: away.colonized }));
  const journal = (away.journal ?? []).map(journalText).filter((x) => x !== "");
  if (journal.length > 0) lines.push(...journal);
  else {
    if (away.won > 0) lines.push(t("away.won", { count: away.won }));
    if (away.lost > 0) lines.push(t("away.lost", { count: away.lost }));
  }
  ui.awayList.replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
  ui.awayReduced.hidden = away.awayMs <= 8 * 3_600_000;
  ui.away.hidden = false;
}

function setStatus(key: MessageKey | null): void {
  ui.status.hidden = key === null;
  if (key) ui.status.textContent = t(key);
}

/** Stacked notices (up to 3 at once), each gone after a few seconds. */
function toast(text: string, tone: "good" | "bad" = "bad"): void {
  const item = document.createElement("div");
  item.className = tone === "good" ? "toast good" : "toast";
  item.textContent = text;
  ui.toast.append(item);
  while (ui.toast.childElementCount > 3) ui.toast.firstElementChild!.remove();
  ui.toast.hidden = false;
  window.setTimeout(() => {
    item.remove();
    if (ui.toast.childElementCount === 0) ui.toast.hidden = true;
  }, 4000);
}

// Client-side prediction between server ticks: the same rules, run on the server's clock.
setInterval(() => {
  if (!game) return;
  advance(game, serverNow());
  mapView?.refreshNetwork();
  render();
}, 100);

// ---------------------------------------------------------------------------

if (token) void startGame(token);
else showAuth();
