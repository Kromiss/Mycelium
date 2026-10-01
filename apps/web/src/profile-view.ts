import {
  COLOR_IDS,
  LEAGUES,
  leagueId,
  SKIN_IDS,
  TITLE_IDS,
  type ClientMessage,
  type Profile,
  type Reward,
} from "@mycelium/shared";
import { cssColor, REWARD_COLORS } from "./colors";
import { t, type MessageKey } from "./i18n";

/** The player's profile (M7): league, cosmetics won and shown, career. */
export class ProfileView {
  private profile: Profile | null = null;

  constructor(
    private readonly el: { overlay: HTMLElement; body: HTMLElement },
    private readonly send: (msg: ClientMessage) => void,
  ) {}

  set(profile: Profile): void {
    this.profile = profile;
    if (!this.el.overlay.hidden) this.render();
  }

  get(): Profile | null {
    return this.profile;
  }

  open(): void {
    this.el.overlay.hidden = false;
    this.render();
  }

  render(): void {
    const p = this.profile;
    if (!p) return;
    const owned = (kind: Reward["kind"]) => p.rewards.filter((r) => r.kind === kind).map((r) => r.id);
    const section = (titleKey: MessageKey) => {
      const s = document.createElement("section");
      s.className = "profile-section";
      const h = document.createElement("h3");
      h.textContent = t(titleKey);
      s.append(h);
      return s;
    };
    const note = (text: string) => {
      const n = document.createElement("p");
      n.className = "muted";
      n.textContent = text;
      return n;
    };

    const league = section("profile.league");
    const badge = document.createElement("p");
    badge.className = `league-badge league-${leagueId(p.league)}`;
    badge.textContent = t("league.label", { league: leagueName(p.league) });
    const ladder = document.createElement("ol");
    ladder.className = "league-ladder";
    for (const [i, id] of LEAGUES.entries()) {
      const li = document.createElement("li");
      li.textContent = t(`league.${id}`);
      li.classList.toggle("current", i === p.league);
      ladder.append(li);
    }
    league.append(badge, ladder, note(t("profile.leagueHelp")));

    const career = note(
      t("profile.career", {
        seasons: p.career.seasons,
        best: p.career.bestRank ?? t("profile.noBest"),
        trophies: p.career.trophies,
        fruitings: p.career.fruitings,
      }),
    );
    career.className = "profile-career";

    const show = (kind: "title" | "color" | "skin", labelKey: MessageKey, ids: readonly string[], current: string | null) => {
      const s = section(labelKey);
      const list = document.createElement("div");
      list.className = "cosmetic-list";
      const mine = owned(kind);
      const choices: Array<string | null> = [null, ...ids.filter((id) => mine.includes(id))];
      for (const id of choices) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cosmetic";
        b.setAttribute("aria-pressed", String(id === current));
        if (kind === "color" && id) {
          const sw = document.createElement("span");
          sw.className = "swatch";
          sw.style.background = cssColor(REWARD_COLORS[id as keyof typeof REWARD_COLORS]);
          b.append(sw, " ");
        }
        b.append(id === null ? (kind === "skin" ? t("skin.default") : t("reward.none")) : rewardName(kind, id));
        b.addEventListener("click", () => this.send({ type: "setCosmetic", kind, id }));
        list.append(b);
      }
      s.append(list);
      const locked = ids.filter((id) => !mine.includes(id));
      if (locked.length > 0) s.append(note(t("profile.lockedList", { list: locked.map((id) => rewardName(kind, id)).join(", ") })));
      return s;
    };

    const titles = show("title", "profile.showTitle", TITLE_IDS, p.title);
    titles.append(note(t("profile.lockedTitles")));
    const colors = show("color", "profile.showColor", COLOR_IDS, p.color);
    const skins = show("skin", "profile.showSkin", SKIN_IDS, p.skin);
    skins.append(note(t("profile.lockedSkins")));

    this.el.body.replaceChildren(league, career, titles, colors, skins);
  }
}

export function leagueName(league: number): string {
  return t(`league.${leagueId(league)}`);
}

export function rewardName(kind: Reward["kind"], id: string): string {
  switch (kind) {
    case "title":
      return t(`title.${id}` as MessageKey);
    case "color":
      return t(`color.${id}` as MessageKey);
    case "skin":
      return t(`skin.${id}` as MessageKey);
  }
}

/** "title “Champion”", "Gold colour"… for the end-of-season card. */
export function rewardText(r: Reward): string {
  return t(`reward.${r.kind}`, { name: rewardName(r.kind, r.id) });
}
