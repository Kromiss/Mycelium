import {
  advance,
  biomassRate,
  checkBuild,
  checkBuyUpgrade,
  checkColonize,
  checkMoveHeart,
  colonizationCost,
  effectsAt,
  enzymeRate,
  glandRate,
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
} from "@mycelium/shared";
import { cssColor, playerColor } from "./colors";
import { formatDuration, formatNumber } from "./format";
import { applyI18n, lang, locale, onLangChange, setLang, t, type MessageKey } from "./i18n";
import { MapView } from "./map-view";
import { choosePassword, clearToken, Connection, loadToken, saveToken, signIn, signOut } from "./net";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  nutrients: $("nutrients"),
  enzymesRes: $("enzymes-res"),
  enzymes: $("enzymes"),
  enzymesRate: $("enzymes-rate"),
  tileStructures: $("tile-structures"),
  structureList: $("structure-list"),
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
let board: Leaderboard | null = null;
let forestNumber = 0;
let history: SeasonResult[] = [];
let lastResult: SeasonResult | null = null;
let token: string | null = loadToken();
let authMode: "login" | "register" = "register";
let selected: Hex | null = null;
let connection: Connection | null = null;
let mapView: MapView | null = null;
let toastTimer: number | undefined;
/** Whether Enzymes were unlocked at the last snapshot, to announce the unlock once. */
let enzymesKnown: boolean | null = null;

const serverNow = () => clock.server + (Date.now() - clock.local) * clock.scale;
const fmt = (n: number) => formatNumber(n, locale());

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
  setAuthMode(authMode);
  if (forestNumber) ui.forestLabel.textContent = t("forest.label", { number: forestNumber });
  renderBoard();
  renderHistory();
  if (!ui.seasonEnd.hidden) showSeasonEnd(lastResult);
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
      applySnapshot(msg.game, msg.owners, msg.serverTime);
      if (msg.away) showAway(msg.away);
      if (msg.needsPassword) ui.password.hidden = false;
      break;
    case "state":
      applySnapshot(msg.game, msg.owners, msg.serverTime);
      for (const e of msg.events) announce(e);
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
  render();
}

function announce(e: CaptureNotice): void {
  const name = owners.get(e.other)?.name ?? "?";
  toast(t(e.kind === "won" ? "capture.won" : "capture.lost", { name }), e.kind === "won" ? "good" : "bad");
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
    note = t("tile.border");
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
    facts.push(["tile.growth", formatDuration(growthDurationMs(tile.terrain, g.upgrades, effectsAt(g, now).growthTime))]);
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

function percent(x: number): string {
  return new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(x);
}

function showAway(away: AwaySummary): void {
  if (away.awayMs < 60_000) return;
  ui.awayTitle.textContent = t("away.title", { time: formatDuration(away.awayMs) });
  const lines = [t("away.nutrients", { value: fmt(away.nutrients) }), t("away.biomass", { value: fmt(away.biomass) })];
  if (away.colonized > 0) lines.push(t("away.colonized", { count: away.colonized }));
  if (away.won > 0) lines.push(t("away.won", { count: away.won }));
  if (away.lost > 0) lines.push(t("away.lost", { count: away.lost }));
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

function toast(text: string, tone: "good" | "bad" = "bad"): void {
  ui.toast.textContent = text;
  ui.toast.classList.toggle("good", tone === "good");
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 2800);
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
