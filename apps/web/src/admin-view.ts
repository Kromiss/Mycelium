import {
  TEST_FOREST_LIMITS,
  TEST_FOREST_PRESETS,
  type AdminError,
  type AdminForest,
  type AdminOp,
  type AdminState,
  type ClientMessage,
  type TestForestSettings,
} from "@mycelium/shared";
import { t, type MessageKey } from "./i18n";

type Preset = keyof typeof TEST_FOREST_PRESETS;
const PRESETS: Preset[] = ["week", "robots", "duel", "quick"];
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The hidden admin page (M9), opened with `#admin` by an admin on a server whose admin tools are on
 * (local development and staging). The server checks every request: this page only sends them.
 */
export class AdminView {
  private state: AdminState | null = null;
  private settings: TestForestSettings = { name: "Test", ...TEST_FOREST_PRESETS.week };
  private refresh: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly el: { overlay: HTMLElement; body: HTMLElement },
    private readonly send: (msg: ClientMessage) => void,
    private readonly format: { time: (ms: number) => string; number: (x: number) => string },
  ) {}

  get isOpen(): boolean {
    return !this.el.overlay.hidden;
  }

  open(): void {
    this.el.overlay.hidden = false;
    this.op({ op: "list" });
    this.render();
    this.refresh ??= setInterval(() => this.op({ op: "list" }), 3000);
  }

  close(): void {
    this.el.overlay.hidden = true;
    if (this.refresh) clearInterval(this.refresh);
    this.refresh = null;
    if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search);
  }

  set(state: AdminState): void {
    this.state = state;
    if (this.isOpen) this.render();
  }

  error(error: AdminError): string {
    return t(`admin.error.${error}` as MessageKey);
  }

  private op(op: AdminOp): void {
    this.send({ type: "admin", ...op } as ClientMessage);
  }

  /** Parts of the page kept between refreshes, so that a refresh never swaps a button under the pointer. */
  private parts: { top: HTMLElement; create: HTMLElement; list: HTMLElement } | null = null;
  private topKey = "";
  private forestBoxes = new Map<string, { box: HTMLElement; info: HTMLElement; actions: HTMLElement; key: string }>();

  private render(): void {
    if (!this.parts) {
      const top = document.createElement("div");
      const create = document.createElement("div");
      const list = section("admin.forests");
      this.parts = { top, create, list };
      this.el.body.replaceChildren(note(t("admin.intro")), top, create, list);
      this.renderCreate();
    }
    const s = this.state;
    const topKey = JSON.stringify([s?.playing ?? null, s?.following ?? null, s?.following ? s.forests.find((f) => f.id === s.following!.forest)?.name : null]);
    if (topKey !== this.topKey) {
      this.topKey = topKey;
      const top: HTMLElement[] = [];
      if (s?.playing) top.push(this.playingBox());
      if (s?.following) top.push(this.followingBox(s.following));
      this.parts.top.replaceChildren(...top);
    }
    this.renderList();
  }

  private renderCreate(): void {
    this.parts?.create.replaceChildren(this.createBox());
  }

  private renderList(): void {
    const list = this.parts!.list;
    const forests = this.state?.forests ?? [];
    const seen = new Set<string>();
    const boxes: HTMLElement[] = [];
    for (const f of forests) {
      seen.add(f.id);
      let entry = this.forestBoxes.get(f.id);
      if (!entry) {
        const box = document.createElement("article");
        box.className = "admin-forest";
        const info = document.createElement("div");
        const actions = document.createElement("div");
        box.append(info, actions);
        entry = { box, info, actions, key: "" };
        this.forestBoxes.set(f.id, entry);
      }
      entry.info.replaceChildren(...this.forestInfo(f));
      const key = JSON.stringify([f.status, f.settings.timeScale, f.settings.robotsOnly, this.state?.playing === f.id, f.players.filter((p) => p.bot).map((p) => p.id)]);
      if (key !== entry.key) {
        entry.key = key;
        entry.actions.replaceChildren(this.forestActions(f));
      }
      boxes.push(entry.box);
    }
    for (const id of [...this.forestBoxes.keys()]) if (!seen.has(id)) this.forestBoxes.delete(id);
    const heading = list.firstElementChild!;
    list.replaceChildren(heading, ...(boxes.length ? boxes : [note(t("admin.none"))]));
  }

  private playingBox(): HTMLElement {
    const box = section("admin.playing");
    const fields: Array<["nutrients" | "enzymes" | "spores" | "biomass", number]> = [
      ["nutrients", 1e6],
      ["enzymes", 100],
      ["spores", 100],
      ["biomass", 1e6],
    ];
    const inputs = fields.map(([k, v]) => {
      const input = numberInput(`give-${k}`, v, 0, 1e300);
      return [k, labelled(t(`admin.give.${k}` as MessageKey), input), input] as const;
    });
    const row = document.createElement("div");
    row.className = "admin-row";
    row.append(...inputs.map(([, l]) => l));
    const give = button(t("admin.give"), () => {
      const op: AdminOp = { op: "give" };
      for (const [k, , input] of inputs) if (Number(input.value) > 0) op[k] = Number(input.value);
      this.op(op);
    });
    const back = button(t("admin.backHome"), () => this.op({ op: "play", forest: null }));
    box.append(row, actions(give, back));
    return box;
  }

  private followingBox(following: { forest: string; bot: string }): HTMLElement {
    const box = section("admin.following");
    const forest = this.state?.forests.find((f) => f.id === following.forest);
    const bot = forest?.players.find((p) => p.id === following.bot);
    box.append(note(t("admin.followingWho", { name: bot?.name ?? "?", forest: forest?.name ?? "?" })));
    box.append(actions(button(t("admin.stopFollowing"), () => this.op({ op: "follow", forest: null }))));
    return box;
  }

  private createBox(): HTMLElement {
    const box = section("admin.create");
    const presets = document.createElement("div");
    presets.className = "admin-row";
    for (const p of PRESETS) {
      presets.append(
        button(t(`admin.preset.${p}` as MessageKey), () => {
          this.settings = { name: t(`admin.preset.${p}` as MessageKey), ...TEST_FOREST_PRESETS[p] };
          this.renderCreate();
        }, "ghost"),
      );
    }
    box.append(note(t("admin.presets")), presets);

    const s = this.settings;
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 40;
    name.value = s.name;
    name.dataset.adminField = "name";
    name.addEventListener("input", () => (s.name = name.value));
    const seed = numberInput("seed", s.seed ?? NaN, 0, 0xffff_ffff);
    seed.placeholder = t("admin.seedRandom");
    seed.addEventListener("input", () => {
      if (seed.value === "") delete s.seed;
      else s.seed = Math.floor(Number(seed.value));
    });
    const bots = numberInput("bots", s.bots, 0, TEST_FOREST_LIMITS.maxCapacity, (v) => (s.bots = v));
    const capacity = numberInput("capacity", s.capacity, TEST_FOREST_LIMITS.minCapacity, TEST_FOREST_LIMITS.maxCapacity, (v) => (s.capacity = v));
    const scale = numberInput("timeScale", s.timeScale, 1, TEST_FOREST_LIMITS.maxTimeScale, (v) => (s.timeScale = v));
    const day = daySelect("startDay", s.startDay, (v) => (s.startDay = v));
    const robotsOnly = checkbox("robotsOnly", s.robotsOnly, (v) => {
      s.robotsOnly = v;
      if (v) s.withMe = false;
      this.renderCreate();
    });
    const withMe = checkbox("withMe", s.withMe, (v) => {
      s.withMe = v;
      if (v) s.robotsOnly = false;
      this.renderCreate();
    });
    const grid = document.createElement("div");
    grid.className = "admin-grid";
    grid.append(
      labelled(t("admin.field.name"), name),
      labelled(t("admin.field.seed"), seed),
      labelled(t("admin.field.bots"), bots),
      labelled(t("admin.field.capacity"), capacity),
      labelled(t("admin.field.timeScale"), scale),
      labelled(t("admin.field.startDay"), day),
      labelled(t("admin.field.robotsOnly"), robotsOnly),
      labelled(t("admin.field.withMe"), withMe),
    );
    box.append(grid, actions(button(t("admin.createGo"), () => this.op({ op: "create", settings: { ...s } }), "primary")));
    return box;
  }

  private forestInfo(f: AdminForest): HTMLElement[] {
    const out: HTMLElement[] = [];
    const h = document.createElement("h4");
    h.textContent = t("admin.forestTitle", { name: f.name, number: f.number });
    const status = document.createElement("span");
    status.className = `admin-status admin-${f.status}`;
    status.textContent = t(`admin.status.${f.status}` as MessageKey);
    h.append(" ", status);
    out.push(h);
    out.push(
      note(
        t("admin.forestFacts", {
          day: t(`admin.day.${f.day}` as MessageKey),
          time: this.format.time(f.gameTime),
          fill: Math.round(f.occupancy * 100),
          scale: this.format.number(f.settings.timeScale),
          seed: f.seed,
          bots: this.format.number(f.apm.bots),
          humans: this.format.number(f.apm.humans),
        }),
      ),
    );
    const table = document.createElement("table");
    table.className = "admin-players";
    const head = document.createElement("tr");
    for (const k of ["admin.col.name", "admin.col.tiles", "admin.col.biomass", "admin.col.zone", "admin.col.apm"] as const) {
      const th = document.createElement("th");
      th.textContent = t(k);
      head.append(th);
    }
    table.append(head);
    for (const p of f.players) {
      const tr = document.createElement("tr");
      for (const v of [p.bot ? t("admin.bot", { name: p.name }) : p.name, this.format.number(p.tiles), this.format.number(p.biomass), String(p.zone), this.format.number(p.apm)]) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.append(td);
      }
      table.append(tr);
    }
    out.push(table);
    if (f.status === "jumping" && f.jumpTarget !== undefined) out.push(note(t("admin.jumping", { time: this.format.time(f.jumpTarget) })));
    return out;
  }

  private forestActions(f: AdminForest): HTMLElement {
    const busy = f.status === "jumping" || f.status === "over";
    const pause = f.status === "paused" ? button(t("admin.resume"), () => this.op({ op: "resume", forest: f.id })) : button(t("admin.pause"), () => this.op({ op: "pause", forest: f.id }));
    pause.disabled = busy;
    const speed = numberInput(`speed-${f.id}`, f.settings.timeScale, 1, TEST_FOREST_LIMITS.maxTimeScale);
    const setSpeed = button(t("admin.setSpeed"), () => this.op({ op: "speed", forest: f.id, timeScale: Number(speed.value) }));
    const jumpDay = daySelect(`jump-${f.id}`, Math.min(6, f.day + 1));
    const jump = button(t("admin.jump"), () => this.op({ op: "jump", forest: f.id, day: Number(jumpDay.value) }));
    jump.disabled = busy;
    const play = button(t("admin.play"), () => this.op({ op: "play", forest: f.id }), "primary");
    play.disabled = f.settings.robotsOnly || this.state?.playing === f.id;
    const bots = f.players.filter((p) => p.bot);
    const who = document.createElement("select");
    who.dataset.adminField = `follow-${f.id}`;
    for (const p of bots) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name;
      who.append(o);
    }
    const follow = button(t("admin.follow"), () => this.op({ op: "follow", forest: f.id, bot: who.value }));
    follow.disabled = bots.length === 0;
    const erase = button(t("admin.erase"), () => {
      if (confirmTwice(erase)) this.op({ op: "erase", forest: f.id });
    }, "danger");
    return actions(pause, labelled(t("admin.field.timeScale"), speed), setSpeed, labelled(t("admin.jumpTo"), jumpDay), jump, play, labelled(t("admin.followWho"), who), follow, erase);
  }
}

function section(titleKey: MessageKey): HTMLElement {
  const s = document.createElement("section");
  s.className = "profile-section";
  const h = document.createElement("h3");
  h.textContent = t(titleKey);
  s.append(h);
  return s;
}

function note(text: string): HTMLElement {
  const n = document.createElement("p");
  n.className = "muted";
  n.textContent = text;
  return n;
}

function button(label: string, onClick: () => void, className = ""): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function actions(...children: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "admin-row";
  row.append(...children);
  return row;
}

function labelled(label: string, input: HTMLElement): HTMLElement {
  const l = document.createElement("label");
  l.className = "admin-field";
  const span = document.createElement("span");
  span.textContent = label;
  l.append(span, input);
  return l;
}

function numberInput(field: string, value: number, min: number, max: number, onChange?: (v: number) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.dataset.adminField = field;
  if (Number.isFinite(value)) input.value = String(value);
  if (onChange) input.addEventListener("input", () => {
    const v = Number(input.value);
    if (input.value !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  });
  return input;
}

function daySelect(field: string, value: number, onChange?: (v: number) => void): HTMLSelectElement {
  const select = document.createElement("select");
  select.dataset.adminField = field;
  for (const d of DAYS) {
    const o = document.createElement("option");
    o.value = String(d);
    o.textContent = t(`admin.day.${d}` as MessageKey);
    select.append(o);
  }
  select.value = String(value);
  if (onChange) select.addEventListener("change", () => onChange(Number(select.value)));
  return select;
}

function checkbox(field: string, value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.dataset.adminField = field;
  input.addEventListener("change", () => onChange(input.checked));
  return input;
}

/** First click arms the button, second click confirms (no browser dialog). */
function confirmTwice(b: HTMLButtonElement): boolean {
  if (b.dataset.armed === "1") return true;
  b.dataset.armed = "1";
  b.textContent = t("admin.eraseConfirm");
  return false;
}
