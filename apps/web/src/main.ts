import {
  advance,
  checkBuyUpgrade,
  checkColonize,
  colonizationCost,
  conversionRate,
  fromSnapshot,
  GAME_NAME,
  growthDurationMs,
  hexEquals,
  hexKey,
  ownedCount,
  productionRate,
  tileYield,
  UPGRADE_IDS,
  upgradeCost,
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
  tileYield: $("tile-yield"),
  tileCost: $("tile-cost"),
  tileGrowth: $("tile-growth"),
  tileColonize: $<HTMLButtonElement>("tile-colonize"),
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

ui.tileColonize.addEventListener("click", () => {
  if (selected) connection?.send({ type: "colonize", q: selected.q, r: selected.r });
});
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

function renderTile(g: GameState): void {
  const tile = selected ? g.tiles.get(hexKey(selected)) : undefined;
  ui.tilePanel.hidden = !tile;
  ui.hint.hidden = Boolean(tile) || ownedCount(g) > 3;
  if (!tile) return;

  ui.tileName.textContent = t(`terrain.${tile.terrain}`);
  ui.tileYield.textContent = t("tile.yieldValue", { value: fmt(tileYield(tile.terrain, g.upgrades)) });
  ui.tilePanel.querySelectorAll<HTMLElement>(".wild-only").forEach((el) => (el.hidden = tile.owned));
  ui.tileStatus.classList.toggle("good", tile.owned);

  if (tile.owned) {
    if (tile.growthEndsAt !== null) {
      ui.tileStatus.textContent = t("tile.growing", { time: formatDuration(tile.growthEndsAt - serverNow()) });
    } else {
      ui.tileStatus.textContent = hexEquals(tile, g.heart) ? t("tile.heart") : t("tile.owned");
    }
    return;
  }

  ui.tileCost.textContent = fmt(colonizationCost(g, tile));
  ui.tileGrowth.textContent = formatDuration(growthDurationMs(tile.terrain, g.upgrades));
  const check = checkColonize(g, tile);
  ui.tileColonize.disabled = !check.ok;
  ui.tileStatus.textContent = check.ok
    ? ""
    : check.error === "not_adjacent"
      ? t("tile.notAdjacent")
      : t(`error.${check.error}`);
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
