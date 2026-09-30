import {
  checkChooseRelic,
  isTainted,
  PACTS,
  RELIC_IDS,
  RELICS,
  SIGNALS,
  signalRate,
  type ClientMessage,
  type GameState,
  type OwnerInfo,
  type RelicId,
  type RosterEntry,
  type SocialView,
} from "@mycelium/shared";
import { formatDuration } from "./format";
import { t, type MessageKey } from "./i18n";

export interface SocialHost {
  send(msg: ClientMessage): void;
  fmt(n: number): string;
  now(): number;
  /** Opens a private conversation with a colony. */
  message(playerId: string): void;
}

/**
 * The Alliance tab (M7): relics to choose, the player's pact of symbiosis, invitations, and the chemical
 * Signals (sending to allies, listening). Lists are rebuilt only when what they show changes, so that
 * clicks land; the forms stay put.
 */
export class SocialPanel {
  private social: SocialView = { pact: null, invitesIn: [], invitesOut: [] };
  private roster: RosterEntry[] = [];
  private me = "";
  private signature = "";
  private breakConfirmUntil = 0;
  private tainted = false;
  private readonly relicSection: HTMLElement;
  private readonly relicList: HTMLElement;
  private readonly relicOwned: HTMLElement;
  private readonly pactStatus: HTMLElement;
  private readonly pactMembers: HTMLElement;
  private readonly leaveBtn: HTMLButtonElement;
  private readonly betrayBtn: HTMLButtonElement;
  private readonly inviteList: HTMLElement;
  private readonly inviteTarget: HTMLSelectElement;
  private readonly inviteBtn: HTMLButtonElement;
  private readonly signalsSection: HTMLElement;
  private readonly signalsLine: HTMLElement;
  private readonly sendTo: HTMLSelectElement;
  private readonly sendResource: HTMLSelectElement;
  private readonly sendAmount: HTMLInputElement;
  private readonly sendBtn: HTMLButtonElement;
  private readonly listenTarget: HTMLSelectElement;
  private readonly listenBtn: HTMLButtonElement;
  private readonly listening: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: SocialHost,
  ) {
    const section = (titleKey: MessageKey, descKey: MessageKey | null) => {
      const s = document.createElement("section");
      s.className = "branch social";
      const h = document.createElement("h3");
      h.dataset.i18n = titleKey;
      s.append(h);
      if (descKey) {
        const p = document.createElement("p");
        p.dataset.i18n = descKey;
        s.append(p);
      }
      root.append(s);
      return s;
    };
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "") => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      return e;
    };

    this.relicSection = section("relic.title", "relic.desc");
    this.relicList = el("ul", "relic-list");
    this.relicOwned = el("p", "muted");
    this.relicSection.append(this.relicList, this.relicOwned);

    const pact = section("pact.title", "pact.desc");
    this.pactStatus = el("p", "pact-status");
    this.pactMembers = el("ul", "pact-members");
    const actions = el("div", "pact-actions");
    this.leaveBtn = el("button");
    this.leaveBtn.type = "button";
    this.leaveBtn.addEventListener("click", () => host.send({ type: "pactLeave" }));
    this.betrayBtn = el("button", "danger");
    this.betrayBtn.type = "button";
    this.betrayBtn.addEventListener("click", () => {
      if (Date.now() < this.breakConfirmUntil) {
        this.breakConfirmUntil = 0;
        host.send({ type: "pactBetray" });
      } else this.breakConfirmUntil = Date.now() + 4000;
      this.refreshButtons();
    });
    actions.append(this.leaveBtn, this.betrayBtn);
    pact.append(this.pactStatus, this.pactMembers, actions);

    const invites = section("invite.title", null);
    this.inviteList = el("ul", "invite-list");
    const row = el("div", "social-row");
    this.inviteTarget = el("select");
    this.inviteBtn = el("button", "primary");
    this.inviteBtn.type = "button";
    this.inviteBtn.dataset.i18n = "invite.send";
    this.inviteBtn.addEventListener("click", () => {
      if (this.inviteTarget.value) host.send({ type: "pactInvite", to: this.inviteTarget.value });
    });
    row.append(this.inviteTarget, this.inviteBtn);
    invites.append(this.inviteList, row);

    this.signalsSection = section("signals.title", "signals.desc");
    this.signalsLine = el("p", "mutation-points");
    const sendRow = el("div", "social-row");
    this.sendTo = el("select");
    this.sendResource = el("select");
    this.sendAmount = el("input");
    this.sendAmount.type = "number";
    this.sendAmount.min = "1";
    this.sendAmount.step = "any";
    this.sendAmount.inputMode = "decimal";
    this.sendBtn = el("button", "primary");
    this.sendBtn.type = "button";
    this.sendBtn.addEventListener("click", () => {
      const amount = Number(this.sendAmount.value);
      const resource = this.sendResource.value === "enzymes" ? "enzymes" : "nutrients";
      if (this.sendTo.value && amount > 0) host.send({ type: "send", to: this.sendTo.value, resource, amount });
    });
    sendRow.append(this.sendTo, this.sendResource, this.sendAmount, this.sendBtn);
    const listenRow = el("div", "social-row");
    this.listenTarget = el("select");
    this.listenBtn = el("button");
    this.listenBtn.type = "button";
    this.listenBtn.addEventListener("click", () => {
      if (this.listenTarget.value) host.send({ type: "listen", target: this.listenTarget.value });
    });
    listenRow.append(this.listenTarget, this.listenBtn);
    this.listening = el("ul", "listening");
    const sendTitle = el("h4");
    sendTitle.dataset.i18n = "signals.sendTitle";
    const listenTitle = el("h4");
    listenTitle.dataset.i18n = "signals.listenTitle";
    this.signalsSection.append(this.signalsLine, sendTitle, sendRow, listenTitle, listenRow, this.listening);
  }

  setRoster(me: string, roster: RosterEntry[]): void {
    this.me = me;
    this.roster = roster;
    this.signature = "";
  }

  setSocial(social: SocialView): void {
    this.social = social;
  }

  /** Language changed: rebuild the lists. */
  refresh(): void {
    this.signature = "";
  }

  /** Tab label: the number of things waiting for the player. */
  pending(g: GameState): number {
    return this.social.invitesIn.length + g.relicPicks;
  }

  render(g: GameState, owners: Map<string, OwnerInfo>): void {
    const now = this.host.now();
    const name = (id: string) => this.roster.find((r) => r.id === id)?.name ?? owners.get(id)?.name ?? "?";
    const minute = (ms: number) => Math.ceil(ms / 60_000);
    const pact = this.social.pact;
    const signature = JSON.stringify([
      g.relicPicks,
      g.relics,
      pact && [pact.members, Object.entries(pact.leaving).map(([id, at]) => [id, minute(at - now)])],
      this.social.invitesIn.map((i) => [i.from, minute(i.at + PACTS.inviteMs - now)]),
      this.social.invitesOut.map((i) => i.to),
      this.roster.map((r) => r.id + r.name),
      Object.entries(g.listens).map(([id, at]) => [id, minute(at - now)]),
      g.allies,
      isTainted(g, now),
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.rebuild(g, name, now);
    }
    // Numbers that change every second.
    this.signalsSection.hidden = !g.signalsUnlocked;
    if (g.signalsUnlocked) {
      this.signalsLine.textContent = t("signals.line", { value: this.host.fmt(g.signals), rate: this.host.fmt(signalRate(g) * 3600) });
    }
    this.sendBtn.textContent = t("signals.send", { cost: SIGNALS.sendCost, loss: Math.round(SIGNALS.sendLoss * 100) });
    this.sendBtn.disabled = g.allies.length === 0 || g.signals < SIGNALS.sendCost;
    this.listenBtn.textContent = t("signals.listen", { cost: SIGNALS.listenCost });
    this.listenBtn.disabled = g.signals < SIGNALS.listenCost || !this.listenTarget.value;
    this.tainted = isTainted(g, now);
    this.pactScore(g);
    this.refreshButtons();
  }

  private pactScore(g: GameState): void {
    const pact = this.social.pact;
    const now = this.host.now();
    if (isTainted(g, now)) this.pactStatus.textContent = t("pact.tainted", { time: formatDuration(g.taintedUntil! - now) });
    else if (pact) this.pactStatus.textContent = t("pact.score", { score: this.host.fmt(pact.score) });
    else this.pactStatus.textContent = t("pact.none");
  }

  private refreshButtons(): void {
    const pact = this.social.pact;
    const leaving = pact?.leaving[this.me] !== undefined;
    this.leaveBtn.hidden = !pact;
    this.betrayBtn.hidden = !pact;
    this.leaveBtn.disabled = leaving;
    this.leaveBtn.textContent = t("pact.leave", { minutes: Math.round(PACTS.leaveNoticeMs / 60_000) });
    this.betrayBtn.textContent = Date.now() < this.breakConfirmUntil ? t("pact.betrayConfirm") : t("pact.betray", { hours: Math.round(PACTS.taintMs / 3_600_000) });
    this.inviteBtn.disabled = !this.inviteTarget.value || this.tainted;
  }

  private rebuild(g: GameState, name: (id: string) => string, now: number): void {
    // Relics: choices when a Ruine was looted, and those owned.
    this.relicSection.hidden = g.relicPicks === 0 && g.relics.length === 0;
    this.relicList.replaceChildren(
      ...(g.relicPicks > 0 ? RELIC_IDS : []).map((id) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t(`relic.${id}.name` as MessageKey);
        b.disabled = !checkChooseRelic(g, id).ok;
        b.addEventListener("click", () => this.host.send({ type: "chooseRelic", relic: id }));
        const p = document.createElement("p");
        p.className = "structure-desc";
        p.textContent = relicText(id);
        li.append(b, p);
        return li;
      }),
    );
    this.relicOwned.hidden = g.relics.length === 0;
    this.relicOwned.textContent = t("relic.owned", { list: g.relics.map((r) => t(`relic.${r}.name` as MessageKey)).join(", ") });

    // The pact.
    const pact = this.social.pact;
    this.pactMembers.replaceChildren(
      ...(pact?.members ?? []).map((id) => {
        const li = document.createElement("li");
        const who = document.createElement("span");
        who.textContent = id === this.me ? t("chat.me") : name(id);
        li.append(who);
        const leaving = pact!.leaving[id];
        if (leaving !== undefined) {
          const small = document.createElement("small");
          small.className = "muted";
          small.textContent = ` ${t("pact.leavingIn", { time: formatDuration(leaving - now) })}`;
          li.append(small);
        }
        if (id !== this.me) {
          const dm = document.createElement("button");
          dm.type = "button";
          dm.className = "ghost small";
          dm.textContent = t("chat.reply");
          dm.addEventListener("click", () => this.host.message(id));
          li.append(" ", dm);
        }
        return li;
      }),
    );

    // Invitations.
    const items: HTMLElement[] = [];
    for (const inv of this.social.invitesIn) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = t("invite.from", { name: name(inv.from), time: formatDuration(inv.at + PACTS.inviteMs - now) });
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "primary small";
      yes.textContent = t("invite.accept");
      yes.addEventListener("click", () => this.host.send({ type: "pactAnswer", from: inv.from, accept: true }));
      const no = document.createElement("button");
      no.type = "button";
      no.className = "small";
      no.textContent = t("invite.decline");
      no.addEventListener("click", () => this.host.send({ type: "pactAnswer", from: inv.from, accept: false }));
      li.append(text, " ", yes, " ", no);
      items.push(li);
    }
    for (const inv of this.social.invitesOut) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = t("invite.to", { name: name(inv.to) });
      items.push(li);
    }
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = t("invite.none");
      items.push(li);
    }
    this.inviteList.replaceChildren(...items);
    const others = [...this.roster].filter((r) => r.id !== this.me).sort((a, b) => a.name.localeCompare(b.name));
    const candidates = others.filter((r) => !g.allies.includes(r.id));
    fillSelect(this.inviteTarget, candidates.map((r) => [r.id, r.name]));

    // Signals.
    fillSelect(this.sendTo, g.allies.map((id) => [id, name(id)]));
    fillSelect(this.sendResource, [
      ["nutrients", t("res.nutrients")],
      ["enzymes", t("res.enzymes")],
    ]);
    fillSelect(this.listenTarget, others.map((r) => [r.id, r.name]));
    const listening = Object.entries(g.listens).filter(([, until]) => until > now);
    this.listening.replaceChildren(
      ...listening.map(([id, until]) => {
        const li = document.createElement("li");
        li.textContent = t("signals.listening", { name: name(id), time: formatDuration(until - now) });
        return li;
      }),
    );
  }
}

function relicText(id: RelicId): string {
  const value = id === "insight" ? RELICS.insight : Math.round(RELICS[id] * 100);
  return t(`relic.${id}.desc` as MessageKey, { value });
}

/** Replaces a select's options only when they change, keeping the current choice when possible. */
function fillSelect(sel: HTMLSelectElement, options: Array<[string, string]>): void {
  const same = sel.options.length === options.length && options.every(([v, text], i) => sel.options[i]!.value === v && sel.options[i]!.text === text);
  if (same) return;
  const current = sel.value;
  sel.replaceChildren(
    ...options.map(([value, text]) => {
      const o = document.createElement("option");
      o.value = value;
      o.text = text;
      return o;
    }),
  );
  if (options.some(([v]) => v === current)) sel.value = current;
}
