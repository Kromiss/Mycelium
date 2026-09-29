import {
  advance,
  checkBuyUpgrade,
  checkColonize,
  checkMoveHeart,
  colonizationCost,
  conversionRate,
  fromSnapshot,
  GAME_NAME,
  growingTiles,
  growthDurationMs,
  heartReadyAt,
  HUMIDITY,
  humidity,
  hexEquals,
  hexKey,
  networkHops,
  ownedCount,
  productionRate,
  QUEUE_MAX,
  queueIndex,
  tileProduction,
  tileYield,
  TRANSPORT,
  transportLoss,
  UPGRADE_IDS,
  upgradeCost,
  type AwaySummary,
  type ClientMessage,
  type GameSnapshot,
  type GameState,
  type Hex,
  type ServerMessage,
} from "@mycelium/shared";
import { formatDuration, formatNumber } from "./format";
import { applyI18n, lang, locale, onLangChange, setLang, t, type MessageKey } from "./i18n";
import { MapView } from "./map-view";
import { clearToken, Connection, createGuest, loadToken, saveToken } from "./net";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  nutrients: $("nutrients"),
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
  guest: $("guest"),
  guestForm: $<HTMLFormElement>("guest-form"),
  guestName: $<HTMLInputElement>("guest-name"),
  guestError: $("guest-error"),
};

let game: GameState | null = null;
/** serverTime − Date.now(), so predictions run on the server's clock. */
let clockOffset = 0;
let selected: Hex | null = null;
let connection: Connection | null = null;
let mapView: MapView | null = null;
let toastTimer: number | undefined;

const serverNow = () => Date.now() + clockOffset;
const fmt = (n: number) => formatNumber(n, locale());

// ---------------------------------------------------------------------------
// Static texts and language

$("brand").textContent = GAME_NAME;
$("guest-brand").textContent = GAME_NAME;
$("version").textContent = t("footer.version", { version: __APP_VERSION__ });
applyI18n(document);
onLangChange(() => {
  applyI18n(document);
  $("version").textContent = t("footer.version", { version: __APP_VERSION__ });
  buildUpgradeList();
  render();
});
$("lang-btn").addEventListener("click", () => setLang(lang() === "en" ? "fr" : "en"));

// ---------------------------------------------------------------------------
// Guest screen

function showGuest(): void {
  ui.guest.hidden = false;
  ui.guestName.focus();
}

ui.guestForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const submit = ui.guestForm.querySelector("button")!;
  submit.disabled = true;
  ui.guestError.hidden = true;
  void createGuest(ui.guestName.value.trim()).then((res) => {
    submit.disabled = false;
    if (!res.ok) {
      ui.guestError.textContent = t(`guest.error.${res.error}`);
      ui.guestError.hidden = false;
      return;
    }
    saveToken(res.guest.token);
    ui.guest.hidden = true;
    void startGame(res.guest.token);
  });
});

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
      applySnapshot(msg.game, msg.serverTime);
      if (msg.away) showAway(msg.away);
      break;
    case "state":
      applySnapshot(msg.game, msg.serverTime);
      break;
    case "authError":
      // The saved guest no longer exists (e.g. local server restarted without a database).
      connection?.stop();
      connection = null;
      clearToken();
      document.body.classList.remove("in-game");
      setStatus(null);
      showGuest();
      break;
    case "actionError":
      toast(t(`error.${msg.error}`));
      break;
  }
}

function applySnapshot(snapshot: GameSnapshot, serverTime: number): void {
  clockOffset = serverTime - Date.now();
  game = fromSnapshot(snapshot);
  mapView?.setGame(game);
  if (!ui.upgradeList.childElementCount) buildUpgradeList();
  render();
}

function selectTile(h: Hex | null): void {
  selected = h;
  mapView?.select(h);
  if (h && window.matchMedia("(max-width: 760px)").matches) setUpgradesOpen(false);
  render();
}

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
  ui.biomassRate.textContent = t("res.perSecond", { value: fmt(rate * conversionRate(game.upgrades)) });
  ui.tiles.textContent = String(ownedCount(game));
  ui.queue.textContent = `${game.queue.length}/${QUEUE_MAX}`;

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

  if (tile.terrain === "wetland") {
    note = t("tile.wetland");
  } else if (tile.owned) {
    tone = "good";
    if (tile.growthEndsAt !== null) {
      status = t("tile.growing", { time: formatDuration(tile.growthEndsAt - now) });
    } else if (tile.disconnectedSince !== null) {
      status = t("tile.disconnected", { time: formatDuration(tile.disconnectedSince + TRANSPORT.witherMs - now) });
      tone = "warn";
    } else {
      status = hexEquals(tile, g.heart) ? t("tile.heart") : t("tile.owned");
      facts.push(["tile.production", t("tile.yieldValue", { value: fmt(tileProduction(g, tile, hops)) })]);
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
    if (tile.terrain === "deadwood") note = t("tile.deadwoodNote");
  } else {
    facts.push(["tile.yield", t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades) * humidity(g, tile)) })]);
    if (tile.exhaustion > 0.005) facts.push(["tile.exhaustion", percent(tile.exhaustion)]);
    facts.push(["tile.cost", fmt(colonizationCost(g, tile))]);
    facts.push(["tile.growth", formatDuration(growthDurationMs(tile.terrain, g.upgrades))]);
    if (tile.terrain === "deadwood") note = t("tile.deadwoodNote");
    const position = queueIndex(g, tile);
    if (position >= 0) {
      status = t("tile.queued", { position: position + 1 });
      actions.push({ label: t("tile.unqueue"), action: "unqueue", disabled: false, primary: false });
    } else {
      const check = checkColonize(g, tile);
      const immediate = g.queue.length === 0 && growingTiles(g).length === 0 && g.nutrients >= colonizationCost(g, tile);
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

function percent(x: number): string {
  return new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(x);
}

function showAway(away: AwaySummary): void {
  if (away.awayMs < 60_000) return;
  ui.awayTitle.textContent = t("away.title", { time: formatDuration(away.awayMs) });
  const lines = [t("away.nutrients", { value: fmt(away.nutrients) }), t("away.biomass", { value: fmt(away.biomass) })];
  if (away.colonized > 0) lines.push(t("away.colonized", { count: away.colonized }));
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

function toast(text: string): void {
  ui.toast.textContent = text;
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

const token = loadToken();
if (token) void startGame(token);
else showGuest();
