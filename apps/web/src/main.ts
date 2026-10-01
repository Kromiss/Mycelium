import {
  ACTION_IDS,
  affordableLevels,
  budReward,
  cohesion,
  COHESION,
  ENRICH,
  enrichCost,
  enrichFactor,
  isEnrichable,
  isRosette,
  nextMilestone,
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
  growthTimeMs,
  zone,
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
  type TileDto,
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
  type SocialView,
  type RosterEntry,
  type SecondaryBoard,
  SECONDARY_BOARDS,
  SIGNALS,
  NEMATODES,
  STORM,
  EVENTS,
} from "@mycelium/shared";
import { cssColor, ownerColor } from "./colors";
import { formatDuration, formatNumber } from "./format";
import { applyI18n, lang, locale, onLangChange, setLang, t, type MessageKey } from "./i18n";
import { ChatView } from "./chat-view";
import { MapView } from "./map-view";
import { NotifyView } from "./notify";
import { SocialPanel } from "./social-view";
import { AdminView } from "./admin-view";
import { leagueName, ProfileView, rewardName, rewardText } from "./profile-view";
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
  tabSocial: $("tab-social"),
  socialView: $("social-view"),
  tileSocial: $("tile-social"),
  signalsRes: $("signals-res"),
  signals: $("signals"),
  allianceRows: $("alliance-rows"),
  allianceEmpty: $("alliance-empty"),
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
  tileEnrich: $("tile-enrich"),
  enrichLevel: $("enrich-level"),
  enrichFactor: $("enrich-factor"),
  enrichBar: $("enrich-bar"),
  enrichNext: $("enrich-next"),
  enrich1: $("enrich-1") as HTMLButtonElement,
  enrich10: $("enrich-10") as HTMLButtonElement,
  enrichMax: $("enrich-max") as HTMLButtonElement,
  enrichBlockButton: $("enrich-block") as HTMLButtonElement,
  enrichLocked: $("enrich-locked"),
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
let panelTab: "upgrades" | "mutations" | "spores" | "social" = "upgrades";
/** The player's pact and invitations (M7). */
let social: SocialView = { pact: null, invitesIn: [], invitesOut: [] };
/** Every colony of the forest, with its title and league (M7). */
let roster = new Map<string, RosterEntry>();
/** Leaderboard tab: the score, or a secondary leaderboard (M7). */
let boardTab: "biomass" | SecondaryBoard = "biomass";

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
const profileView = new ProfileView({ overlay: $("profile"), body: $("profile-body") }, (msg) => connection?.send(msg));
ui.player.addEventListener("click", () => profileView.open());
$("profile-close").addEventListener("click", () => ($("profile").hidden = true));

// Hidden admin page (M9): `#admin`, for admins on a server whose admin tools are on (local, staging).
let adminTools = false;
const adminView = new AdminView({ overlay: $("admin"), body: $("admin-body") }, (msg) => connection?.send(msg), {
  time: (ms) => new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).format(ms),
  number: (x) => fmt(x),
});
$("admin-close").addEventListener("click", () => adminView.close());
$("admin-btn").addEventListener("click", () => {
  window.history.replaceState(null, "", "#admin");
  adminView.open();
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#admin" && adminTools && !adminView.isOpen) adminView.open();
});
$("spectate-stop").addEventListener("click", () => connection?.send({ type: "admin", op: "follow", forest: null }));
/** Tiles of the last full state, updated by the deltas (M9: states only carry the tiles that changed). */
let tileDtos = new Map<string, TileDto>();
// Leaderboard tabs (M7): the score, then the secondary leaderboards.
const boardTabs = (["biomass", ...SECONDARY_BOARDS] as const).map((id) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tab";
  b.setAttribute("role", "tab");
  b.addEventListener("click", () => {
    boardTab = id;
    renderBoard();
  });
  $("board-tabs").append(b);
  return { id, b };
});
const socialPanel = new SocialPanel(ui.socialView, {
  send: (msg) => connection?.send(msg),
  fmt: (n) => fmt(n),
  now: () => serverNow(),
  message: (id) => chat.openWith(id),
});
// Actions on another colony's tile (M7): invite, listen, write.
const tileSocialButtons = (["invite", "listen", "message"] as const).map((kind) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = kind === "invite" ? "primary" : "";
  b.addEventListener("click", () => {
    const owner = b.dataset.owner;
    if (!owner) return;
    if (kind === "invite") connection?.send({ type: "pactInvite", to: owner });
    else if (kind === "listen") connection?.send({ type: "listen", target: owner });
    else chat.openWith(owner);
  });
  ui.tileSocial.append(b);
  return { kind, b };
});
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
  socialPanel.refresh();
  profileView.render();
  applyI18n(ui.socialView);
  renderAlliances();
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
    // M8: tapping a bud picks it at once (the reward is shown right away, the server confirms).
    mapView.onBud((h) => {
      if (!game) return;
      const reward = budReward(game, serverNow());
      connection?.send({ type: "pickBud", q: h.q, r: h.r } satisfies ClientMessage);
      toast(t("bud.picked", { nutrients: fmt(reward.nutrients) }), "good");
    });
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
      ui.forestLabel.textContent = msg.forest.test ? t("test.banner", { name: msg.forest.test }) : t("forest.label", { number: forestNumber });
      adminTools = msg.adminTools === true;
      $("admin-btn").hidden = !adminTools;
      $("spectate-banner").hidden = msg.spectating === undefined;
      $("spectate-text").textContent = msg.spectating !== undefined ? t("spectate.banner", { name: msg.spectating }) : "";
      document.body.classList.toggle("spectating", msg.spectating !== undefined);
      if (adminTools && location.hash === "#admin" && !adminView.isOpen) adminView.open();
      tileDtos = new Map();
      clock.scale = msg.timeScale;
      history = msg.history;
      renderHistory();
      setForestEvents(msg.forestEvents ?? []);
      applySnapshot(msg.game, msg.owners, msg.serverTime);
      chat.load({ me: msg.player.id, admin: msg.admin, silencedUntil: msg.silencedUntil, roster: msg.roster, chat: msg.chat, muted: msg.muted });
      socialPanel.setRoster(msg.player.id, msg.roster);
      roster = new Map(msg.roster.map((r) => [r.id, r]));
      setSocial(msg.social);
      profileView.set(msg.profile);
      void notify.resubscribe();
      if (msg.away) showAway(msg.away);
      if (msg.needsPassword) ui.password.hidden = false;
      break;
    case "profile":
      profileView.set(msg.profile);
      buildStrainList();
      break;
    case "roster":
      roster = new Map(msg.roster.map((r) => [r.id, r]));
      renderBoard();
      chat.setRoster(msg.roster);
      if (game) socialPanel.setRoster(game.id, msg.roster);
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
      if (msg.social) setSocial(msg.social);
      applySnapshot(msg.game, msg.owners, msg.serverTime, msg.delta === true, msg.gone);
      for (const e of msg.events) announce(e);
      for (const n of msg.eventNotices ?? []) announceEvent(n);
      for (const a of msg.alerts ?? []) alert(a);
      break;
    case "leaderboard":
      board = msg.leaderboard;
      renderBoard();
      renderAlliances();
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
    case "admin":
      adminView.set(msg.state);
      break;
    case "adminError":
      toast(adminView.error(msg.error));
      break;
    case "adminSwitch":
      // The admin now plays in (or watches) another forest: start again from a fresh page.
      location.reload();
      break;
  }
}

function applySnapshot(snapshot: GameSnapshot, list: OwnerInfo[], serverTime: number, delta = false, gone: string[] = []): void {
  clock = { server: serverTime, local: Date.now(), scale: clock.scale };
  for (const o of list) owners.set(o.id, o);
  if (!delta) tileDtos = new Map();
  for (const k of gone) tileDtos.delete(k);
  for (const tile of snapshot.tiles) tileDtos.set(hexKey(tile), tile);
  // States can come fast (test forests run up to ×3600): the map is rebuilt at most a few times a second,
  // always from the latest state.
  pendingState = { snapshot, list };
  if (!delta || game === null) flushState();
  else if (stateTimer === null) stateTimer = setTimeout(flushState, Math.max(0, lastFlush + STATE_MIN_MS - Date.now()));
}

const STATE_MIN_MS = 250;
let pendingState: { snapshot: GameSnapshot; list: OwnerInfo[] } | null = null;
let stateTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlush = 0;

function flushState(): void {
  if (stateTimer !== null) clearTimeout(stateTimer);
  stateTimer = null;
  const pending = pendingState;
  if (!pending) return;
  pendingState = null;
  lastFlush = Date.now();
  const { snapshot, list } = pending;
  game = fromSnapshot({ ...snapshot, tiles: [...tileDtos.values()] });
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
  else if (a.type === "action") toast(t("alert.action", { name, action: t(`action.${a.action}.name`) }));
  else toast(t(`alert.pact.${a.event}`, { name }), a.event === "betrayed" || a.event === "left" || a.event === "ended" || a.event === "declined" ? "bad" : "good");
}

function setSocial(view: SocialView): void {
  social = view;
  socialPanel.setSocial(view);
  chat.setPact(view.pact !== null);
}

/** The alliance leaderboard (M7), in the full leaderboard. */
function renderAlliances(): void {
  const list = board?.alliances ?? [];
  ui.allianceEmpty.hidden = list.length > 0;
  ui.allianceRows.replaceChildren(
    ...list.map((a) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("me", social.pact?.id === a.id);
      const cells = [String(a.rank), a.active ? a.members.join(", ") : `${a.members.join(", ")} ${t("board.allianceEnded")}`, fmt(a.score)];
      cells.forEach((v, i) => {
        const td = document.createElement("td");
        td.textContent = v;
        if (i === 2) td.className = "num";
        tr.append(td);
      });
      return tr;
    }),
  );
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
    case "pact":
      return t(`journal.pact.${line.event}`, { name: line.name });
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
  sw.style.background = game && id === game.id ? "var(--glow)" : cssColor(ownerColor(owners.get(id) ?? roster.get(id)));
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
        if (i === 1) appendTitle(td, e.id);
        if (i >= 2) td.className = "num";
        tr.append(td);
      });
      return tr;
    }),
  );
  renderSecondary();
}

/** The chosen title of a colony, small, after its name (M7). */
function appendTitle(td: HTMLElement, id: string): void {
  const entry = roster.get(id);
  if (!entry?.title) return;
  const small = document.createElement("small");
  small.className = "muted board-title";
  small.textContent = ` · ${rewardName("title", entry.title)}`;
  td.append(small);
}

/** Leaderboard tabs (M7): the biomass table, or one of the secondary leaderboards. */
function renderSecondary(): void {
  for (const { id, b } of boardTabs) {
    b.textContent = t(`board.tab.${id}`);
    b.setAttribute("aria-selected", String(id === boardTab));
  }
  const main = boardTab === "biomass";
  $("board-table").hidden = !main;
  $("secondary-table").hidden = main;
  const note = $("secondary-note");
  note.hidden = boardTab !== "efficiency";
  note.textContent = t("board.efficiencyNote");
  if (boardTab === "biomass" || !board) return;
  const tab: SecondaryBoard = boardTab;
  $("secondary-value").textContent = t(`board.value.${tab}`);
  const list = board.secondary?.[tab] ?? [];
  const rows = $("secondary-rows");
  if (list.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = t("board.secondaryEmpty");
    tr.append(td);
    rows.replaceChildren(tr);
    return;
  }
  rows.replaceChildren(
    ...list.map((e) => {
      const tr = document.createElement("tr");
      tr.classList.toggle("me", e.id === game?.id);
      const rank = document.createElement("td");
      rank.textContent = String(e.rank);
      const name = document.createElement("td");
      name.append(swatch(e.id), " ", e.name);
      appendTitle(name, e.id);
      const value = document.createElement("td");
      value.className = "num";
      value.textContent = fmt(e.value);
      tr.append(rank, name, value);
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
  const leagueLine = $("season-end-league");
  leagueLine.hidden = !result?.league;
  if (result?.league) {
    leagueLine.textContent =
      result.league.before === result.league.after
        ? t("seasonEnd.leagueSame", { league: leagueName(result.league.after) })
        : t("seasonEnd.league", { before: leagueName(result.league.before), after: leagueName(result.league.after) });
  }
  const rewardsLine = $("season-end-rewards");
  const won = result?.rewards ?? [];
  rewardsLine.hidden = won.length === 0;
  rewardsLine.textContent = `${t("seasonEnd.rewards", { list: won.map(rewardText).join(", ") })} ${t("seasonEnd.rewardsHint")}`;
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

// M8 enrichment (GDD §4.4): ×1, ×10, max, and the whole block.
const sendEnrich = (count: number | "max") => {
  if (selected) connection?.send({ type: "enrich", q: selected.q, r: selected.r, count } satisfies ClientMessage);
};
ui.enrich1.addEventListener("click", () => sendEnrich(1));
ui.enrich10.addEventListener("click", () => sendEnrich(ENRICH.batch));
ui.enrichMax.addEventListener("click", () => sendEnrich("max"));
ui.enrichBlockButton.addEventListener("click", () => {
  if (selected) connection?.send({ type: "enrichBlock", q: selected.q, r: selected.r } satisfies ClientMessage);
});

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
  ui.tabSocial.setAttribute("aria-selected", String(tab === "social"));
  ui.socialView.hidden = tab !== "social";
  ui.upgradesView.hidden = tab !== "upgrades";
  ui.mutationsView.hidden = tab !== "mutations";
  ui.sporesView.hidden = tab !== "spores";
  render();
}
ui.tabUpgrades.addEventListener("click", () => setPanelTab("upgrades"));
ui.tabMutations.addEventListener("click", () => setPanelTab("mutations"));
ui.tabSpores.addEventListener("click", () => setPanelTab("spores"));
ui.tabSocial.addEventListener("click", () => setPanelTab("social"));

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

const AUTO_TERRAINS: Terrain[] = ["litter", "humus", "deadwood", "stump", "roots", "wetland"];

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
  ui.signalsRes.hidden = !game.signalsUnlocked;
  if (game.signalsUnlocked) ui.signals.textContent = fmt(game.signals);
  const pending = socialPanel.pending(game);
  ui.tabSocial.textContent = pending > 0 ? t("social.tabPending", { count: pending }) : t("social.tab");
  if (panelTab === "social") socialPanel.render(game, owners);
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

/** M8 Cohésion of a colonised tile: its neighbours, and what they give in production and defence. */
function cohesionFact(g: GameState, tile: Tile): [MessageKey, string] {
  const n = cohesion(g.tiles, tile);
  return [
    "tile.cohesion",
    t("tile.cohesionValue", {
      count: n,
      production: Math.round(COHESION.production * n * 100),
      pressure: Math.round(COHESION.pressure * n * 100),
      capture: Math.round(COHESION.captureTime * n * 100),
    }),
  ];
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
    const holderInfo = owners.get(tile.owner);
    const holder = holderInfo?.name ?? "?";
    status = holderInfo?.ally ? t("tile.ally", { name: holder }) : t("tile.ownerOther", { name: holder });
    if (tile.capture) {
      const pct = new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(tile.capture.progress);
      status =
        tile.capture.by === g.id
          ? t("tile.attacking", { percent: pct })
          : t("tile.underAttack", { name: owners.get(tile.capture.by)?.name ?? "?", percent: pct });
    }
    facts.push(["tile.yield", t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades) * richness(g, tile)) })]);
    if (tile.level > 0) facts.push(["tile.level", String(tile.level)]);
    facts.push(cohesionFact(g, tile));
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
      facts.push(cohesionFact(g, tile));
      if (tile.structure) facts.push(["tile.structure", t(`structure.${tile.structure}.name`)]);
      if (tile.structure === "gland" && hops.has(hexKey(tile))) facts.push(["tile.enzymes", t("tile.enzymesValue", { value: fmt(glandRate(tile) * 3600) })]);
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
    if (isRosette(g.tiles, tile)) note ||= t("tile.rosette");
    note ||= terrainNote(tile.terrain);
    buildable = hops.has(hexKey(tile)) && tile.growthEndsAt === null;
  } else {
    facts.push(["tile.yield", t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades) * richness(g, tile) * humidity(g, tile)) })]);
    facts.push(["tile.zone", t("tile.zoneValue", { zone: zone(g, tile) })]);
    const cost = colonizationCost(g, tile, now);
    facts.push(["tile.cost", TERRAIN_STATS[tile.terrain].paidInEnzymes ? t("tile.costEnzymes", { value: fmt(cost) }) : fmt(cost)]);
    facts.push(["tile.growth", formatDuration(growthTimeMs(g, tile, now))]);
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
  renderEnrich(g, tile, hops);
  renderStructures(g, tile, buildable);
  renderConflict(g, tile, now);
  renderTileSocial(g, tile, now);
  if (tile.owner !== null && owners.get(tile.owner)?.tainted && tile.owner !== g.id) note = `${t("tile.taintedOwner")} ${note}`.trim();
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

/** M8: the tile's level, what it gives, the next milestone, and the buttons to buy more. */
function renderEnrich(g: GameState, tile: Tile, hops: Map<string, number>): void {
  const mine = tile.owner === g.id;
  ui.tileEnrich.hidden = !mine || !isEnrichable(tile);
  if (ui.tileEnrich.hidden) return;
  const ready = tile.growthEndsAt === null && hops.has(hexKey(tile));
  const rosette = isRosette(g.tiles, tile);
  ui.enrichLevel.textContent = t("enrich.level", { level: tile.level });
  ui.enrichFactor.textContent = tile.level > 0 ? t("enrich.factor", { value: fmtFactor(enrichFactor(tile.level, rosette)) }) : "";
  const next = nextMilestone(tile.level);
  const previous = next <= ENRICH.milestones[0]! ? 0 : [...ENRICH.milestones].reverse().find((m) => m < next) ?? next - ENRICH.milestoneEvery;
  ui.enrichBar.style.width = `${Math.round(((tile.level - previous) / (next - previous)) * 100)}%`;
  ui.enrichNext.textContent = t("enrich.next", { level: next });
  ui.enrichLocked.hidden = ready;
  const one = enrichCost(g, tile);
  const ten = Math.max(1, affordableLevels(g, tile, ENRICH.batch));
  const max = affordableLevels(g, tile);
  ui.enrich1.textContent = t("enrich.one", { cost: fmt(one) });
  ui.enrich10.textContent = t("enrich.ten", { count: ten, cost: fmt(enrichCost(g, tile, ten)) });
  ui.enrichMax.textContent = t("enrich.max", { count: max });
  ui.enrichBlockButton.textContent = t("enrich.block");
  ui.enrich1.disabled = !ready || g.nutrients < one;
  ui.enrich10.disabled = ui.enrich1.disabled;
  ui.enrichMax.disabled = !ready || max === 0;
  ui.enrichBlockButton.disabled = !ready || g.nutrients < one;
}

function fmtFactor(x: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: x < 10 ? 2 : 0 }).format(x);
}

function terrainNote(terrain: Terrain): string {
  switch (terrain) {
    case "stump":
      return t("tile.stumpNote");
    case "roots":
      return t("tile.rootsNote", { bonus: Math.round(ROOTS.networkBonus * 100) });
    case "rock":
      return t("tile.rockNote");
    case "carcass":
      return t("tile.carcassNote");
    case "tree":
      return t("tile.treeNote");
    case "ruin":
      return t("tile.ruinNote");
    case "rubble":
      return t("tile.rubbleNote");
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
/** Pact, listening and private message for another colony's tile (M7). */
function renderTileSocial(g: GameState, tile: Tile, now: number): void {
  const other = tile.owner !== null && tile.owner !== g.id ? tile.owner : null;
  ui.tileSocial.hidden = other === null;
  if (other === null) return;
  const info = owners.get(other);
  for (const { kind, b } of tileSocialButtons) {
    b.dataset.owner = other;
    if (kind === "invite") {
      b.textContent = t("tile.invite");
      b.hidden = info?.ally === true;
      b.disabled = g.taintedUntil !== null && g.taintedUntil > now;
    } else if (kind === "listen") {
      b.textContent = t("tile.listen", { cost: SIGNALS.listenCost });
      b.hidden = !g.signalsUnlocked;
      b.disabled = g.signals < SIGNALS.listenCost;
    } else b.textContent = t("tile.message");
  }
}

function renderConflict(g: GameState, tile: Tile, now: number): void {
  const enemy = tile.owner !== null && tile.owner !== g.id && tile.growthEndsAt === null && !owners.get(tile.owner)?.ally;
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
