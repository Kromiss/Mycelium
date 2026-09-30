import type { ChatError, ChatMessage, ClientMessage, RosterEntry } from "@mycelium/shared";
import { cssColor, playerColor } from "./colors";
import { locale, t } from "./i18n";
import { rewardName } from "./profile-view";

/** A conversation: the whole forest, the player's pact, or one other colony. */
type Conversation = { kind: "forest" } | { kind: "pact" } | { kind: "dm"; with: string };

const keyOf = (c: Conversation) => (c.kind === "dm" ? `dm:${c.with}` : c.kind);

export interface ChatHost {
  send(msg: ClientMessage): void;
  toast(text: string, tone?: "good" | "bad"): void;
}

/**
 * The chat panel (M7): forest chat, pact chat and private messages, with mute, report and the
 * admins' 24 h silence. The server filters what each player may read; this only displays it.
 */
export class ChatView {
  private me = "";
  private admin = false;
  private silencedUntil: number | null = null;
  private roster: RosterEntry[] = [];
  private messages: ChatMessage[] = [];
  private muted = new Set<string>();
  private unread = new Map<string, number>();
  private current: Conversation = { kind: "forest" };
  private hasPact = false;
  private openMenu: number | null = null;

  constructor(
    private readonly el: {
      panel: HTMLElement;
      toggle: HTMLElement;
      badge: HTMLElement;
      channel: HTMLSelectElement;
      list: HTMLElement;
      form: HTMLFormElement;
      input: HTMLInputElement;
      note: HTMLElement;
    },
    private readonly host: ChatHost,
  ) {
    el.toggle.addEventListener("click", () => this.setOpen(el.panel.hidden));
    el.channel.addEventListener("change", () => this.select(this.parse(el.channel.value)));
    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = el.input.value.trim();
      if (!text) return;
      const c = this.current;
      host.send(c.kind === "dm" ? { type: "chat", channel: "dm", to: c.with, text } : { type: "chat", channel: c.kind, text });
      el.input.value = "";
    });
  }

  /** The game is (re)loaded: who the player is and what they can read. */
  load(data: { me: string; admin: boolean; silencedUntil: number | null; roster: RosterEntry[]; chat: ChatMessage[]; muted: string[] }): void {
    this.me = data.me;
    this.admin = data.admin;
    this.silencedUntil = data.silencedUntil;
    this.roster = data.roster;
    this.messages = data.chat;
    this.muted = new Set(data.muted);
    this.unread.clear();
    if (this.current.kind === "dm" && !this.roster.some((r) => r.id === (this.current as { with: string }).with)) this.current = { kind: "forest" };
    this.render();
  }

  setRoster(roster: RosterEntry[]): void {
    this.roster = roster;
    this.render();
  }

  /** Whether the player has a pact (M7 step 2): shows the pact conversation. */
  setPact(hasPact: boolean): void {
    if (this.hasPact === hasPact) return;
    this.hasPact = hasPact;
    if (!hasPact && this.current.kind === "pact") this.current = { kind: "forest" };
    this.render();
  }

  receive(m: ChatMessage): void {
    this.messages.push(m);
    if (this.messages.length > 400) this.messages.splice(0, this.messages.length - 400);
    const conv = this.conversationOf(m);
    const visible = !this.el.panel.hidden && keyOf(conv) === keyOf(this.current);
    if (!visible && m.from !== this.me) this.unread.set(keyOf(conv), (this.unread.get(keyOf(conv)) ?? 0) + 1);
    this.render();
  }

  error(error: ChatError): void {
    this.host.toast(t(`chat.error.${error}`));
    if (error === "silenced" && this.silencedUntil === null) this.silencedUntil = Date.now() + 3_600_000;
  }

  /** Language changed. */
  refresh(): void {
    this.render();
  }

  setOpen(open: boolean): void {
    this.el.panel.hidden = !open;
    document.body.classList.toggle("chat-open", open);
    if (open) {
      this.unread.delete(keyOf(this.current));
      this.render();
      this.el.input.focus({ preventScroll: true });
    } else this.renderBadge();
  }

  /** Opens a private conversation with a colony (from the map or the leaderboard). */
  openWith(playerId: string): void {
    if (playerId === this.me) return;
    this.select({ kind: "dm", with: playerId });
    this.setOpen(true);
  }

  // -------------------------------------------------------------------------

  private select(c: Conversation): void {
    this.current = c;
    this.openMenu = null;
    this.unread.delete(keyOf(c));
    this.render();
  }

  private parse(value: string): Conversation {
    if (value.startsWith("dm:")) return { kind: "dm", with: value.slice(3) };
    return value === "pact" ? { kind: "pact" } : { kind: "forest" };
  }

  private conversationOf(m: ChatMessage): Conversation {
    if (m.channel === "dm") return { kind: "dm", with: m.from === this.me ? m.to! : m.from };
    return { kind: m.channel };
  }

  private name(id: string): string {
    return this.roster.find((r) => r.id === id)?.name ?? "?";
  }

  private render(): void {
    this.renderChannels();
    this.renderList();
    this.renderForm();
    this.renderBadge();
  }

  private renderChannels(): void {
    const label = (c: Conversation, text: string) => {
      const n = this.unread.get(keyOf(c)) ?? 0;
      return n > 0 ? t("chat.unread", { label: text, count: n }) : text;
    };
    const options: Array<[string, string]> = [["forest", label({ kind: "forest" }, t("chat.forest"))]];
    if (this.hasPact) options.push(["pact", label({ kind: "pact" }, t("chat.pact"))]);
    for (const r of [...this.roster].sort((a, b) => a.name.localeCompare(b.name))) {
      if (r.id === this.me) continue;
      options.push([`dm:${r.id}`, label({ kind: "dm", with: r.id }, t("chat.dmWith", { name: r.name }))]);
    }
    const sel = this.el.channel;
    const same = sel.options.length === options.length && options.every(([v, text], i) => sel.options[i]!.value === v && sel.options[i]!.text === text);
    if (!same) {
      sel.replaceChildren(
        ...options.map(([value, text]) => {
          const o = document.createElement("option");
          o.value = value;
          o.text = text;
          return o;
        }),
      );
    }
    sel.value = keyOf(this.current);
  }

  private renderList(): void {
    const key = keyOf(this.current);
    const shown = this.messages.filter((m) => keyOf(this.conversationOf(m)) === key && (m.from === this.me || !this.muted.has(m.from)));
    const list = this.el.list;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (shown.length === 0) {
      const li = document.createElement("li");
      li.className = "muted chat-empty";
      li.textContent = t("chat.empty");
      list.replaceChildren(li);
      return;
    }
    const time = new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" });
    list.replaceChildren(
      ...shown.map((m) => {
        const li = document.createElement("li");
        li.classList.toggle("me", m.from === this.me);
        const head = document.createElement("button");
        head.type = "button";
        head.className = "chat-head";
        const when = document.createElement("span");
        when.className = "chat-time";
        when.textContent = time.format(m.at);
        const sw = document.createElement("span");
        sw.className = "swatch";
        const entry = this.roster.find((r) => r.id === m.from);
        sw.style.background = m.from === this.me ? "var(--glow)" : cssColor(playerColor(entry?.color ?? 0));
        const who = document.createElement("span");
        who.className = "chat-name";
        who.textContent = m.from === this.me ? t("chat.me") : (entry?.name ?? m.fromName);
        head.append(when, sw, who);
        if (entry?.title) {
          const title = document.createElement("span");
          title.className = "chat-title";
          title.textContent = rewardName("title", entry.title);
          head.append(title);
        }
        head.disabled = m.from === this.me;
        head.addEventListener("click", () => {
          this.openMenu = this.openMenu === m.id ? null : m.id;
          this.renderList();
        });
        const text = document.createElement("p");
        text.className = "chat-text";
        text.textContent = m.text;
        li.append(head, text);
        if (this.openMenu === m.id && m.from !== this.me) li.append(this.menu(m));
        return li;
      }),
    );
    if (atBottom || shown.at(-1)?.from === this.me) list.scrollTop = list.scrollHeight;
  }

  private menu(m: ChatMessage): HTMLElement {
    const row = document.createElement("div");
    row.className = "chat-menu";
    const button = (label: string, action: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        this.openMenu = null;
        action();
        this.render();
      });
      row.append(b);
    };
    if (this.current.kind !== "dm") button(t("chat.reply"), () => this.select({ kind: "dm", with: m.from }));
    const name = this.name(m.from);
    if (this.muted.has(m.from)) {
      button(t("chat.unmute"), () => {
        this.muted.delete(m.from);
        this.host.send({ type: "mute", player: m.from, muted: false });
        this.host.toast(t("chat.mutedOff", { name }), "good");
      });
    } else {
      button(t("chat.mute"), () => {
        this.muted.add(m.from);
        this.host.send({ type: "mute", player: m.from, muted: true });
        this.host.toast(t("chat.mutedOn", { name }), "good");
      });
    }
    button(t("chat.report"), () => this.host.send({ type: "report", message: m.id }));
    if (this.admin) button(t("chat.silence"), () => this.host.send({ type: "silence", player: m.from }));
    return row;
  }

  private renderForm(): void {
    const c = this.current;
    const silenced = this.silencedUntil !== null && this.silencedUntil > Date.now();
    this.el.input.disabled = silenced;
    this.el.input.placeholder =
      c.kind === "dm" ? t("chat.placeholder.dm", { name: this.name(c.with) }) : t(c.kind === "pact" ? "chat.placeholder.pact" : "chat.placeholder.forest");
    let note = "";
    if (silenced) {
      const time = new Intl.DateTimeFormat(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(this.silencedUntil!);
      note = t("chat.silenced", { time });
    } else if (c.kind === "dm" && this.muted.has(c.with)) note = t("chat.mutedNote", { name: this.name(c.with) });
    this.el.note.hidden = note === "";
    this.el.note.textContent = note;
  }

  private renderBadge(): void {
    let n = 0;
    for (const count of this.unread.values()) n += count;
    this.el.badge.hidden = n === 0;
    this.el.badge.textContent = n > 99 ? "99+" : String(n);
  }
}
