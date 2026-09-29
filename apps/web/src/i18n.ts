/**
 * Every text shown to the player goes through `t()` (CLAUDE.md: EN + FR, no hard-coded UI text).
 * Static HTML uses `data-i18n="key"` (text) or `data-i18n-aria="key"` (aria-label + title).
 */

const en = {
  "app.tagline": "Grow. Spread. Digest the forest.",
  "status.connecting": "Connecting…",
  "status.reconnecting": "Connection lost — reconnecting…",
  "lang.switch": "Français",
  "lang.switchLabel": "Passer en français",

  "guest.title": "Germinate your colony",
  "guest.subtitle": "Pick a name for your mycelium. You play as a guest: this browser remembers you.",
  "guest.nameLabel": "Colony name",
  "guest.namePlaceholder": "e.g. Mycena",
  "guest.hint": "3 to 20 letters, digits, _ or -",
  "guest.submit": "Germinate",
  "guest.error.invalid_name": "This name is not valid: use 3 to 20 letters, digits, _ or -.",
  "guest.error.name_taken": "This name is already taken.",
  "guest.error.network": "The server cannot be reached. Try again in a moment.",

  "res.nutrients": "Nutrients",
  "res.biomass": "Biomass",
  "res.perSecond": "+{value}/s",
  "res.tiles": "Tiles",

  "terrain.litter": "Leaf litter",
  "terrain.humus": "Humus",
  "terrain.deadwood": "Dead wood",

  "tile.hint": "Tap a glowing tile next to your network to colonize it. Drag to move, pinch or scroll to zoom.",
  "tile.yield": "Yield",
  "tile.yieldValue": "{value} nutrients/s",
  "tile.cost": "Cost",
  "tile.growth": "Growth",
  "tile.colonize": "Colonize",
  "tile.heart": "Your starting spore",
  "tile.owned": "Part of your network",
  "tile.growing": "Hyphae growing — {time} left",
  "tile.notAdjacent": "Out of reach: colonize tiles next to your network first.",
  "tile.close": "Close",

  "upgrades.title": "Upgrades",
  "upgrades.level": "Lv {level}",
  "upgrades.buy": "{cost}",
  "upgrade.digestion.name": "Enhanced digestion",
  "upgrade.digestion.desc": "+10% yield on every tile per level.",
  "upgrade.hyphalGrowth.name": "Hyphal growth",
  "upgrade.hyphalGrowth.desc": "−8% growth time per level.",
  "upgrade.thriftyExpansion.name": "Thrifty expansion",
  "upgrade.thriftyExpansion.desc": "−5% colonization cost per level.",
  "upgrade.biomassConversion.name": "Biomass conversion",
  "upgrade.biomassConversion.desc": "+10% conversion to biomass per level.",
  "upgrade.woodDecomposer.name": "Wood decomposer",
  "upgrade.woodDecomposer.desc": "+15% Dead wood yield per level.",

  "error.unknown_tile": "This tile does not exist.",
  "error.already_owned": "This tile is already yours.",
  "error.not_adjacent": "Only tiles next to your network can be colonized.",
  "error.growth_limit": "Your hyphae are already growing somewhere: wait until they finish.",
  "error.not_enough_nutrients": "Not enough nutrients.",
  "error.unknown_upgrade": "Unknown upgrade.",
  "error.not_authenticated": "You are not connected yet.",

  "zoom.in": "Zoom in",
  "zoom.out": "Zoom out",
  "zoom.home": "Center on my network",
  "panel.upgrades": "Show upgrades",

  "footer.version": "v{version}",
};

export type MessageKey = keyof typeof en;
export type Lang = "en" | "fr";

const fr: Record<MessageKey, string> = {
  "app.tagline": "Pousse. Étends-toi. Digère la forêt.",
  "status.connecting": "Connexion…",
  "status.reconnecting": "Connexion perdue — reconnexion…",
  "lang.switch": "English",
  "lang.switchLabel": "Switch to English",

  "guest.title": "Fais germer ta colonie",
  "guest.subtitle": "Choisis un nom pour ton mycélium. Tu joues en invité : ce navigateur se souvient de toi.",
  "guest.nameLabel": "Nom de la colonie",
  "guest.namePlaceholder": "ex. Mycena",
  "guest.hint": "3 à 20 lettres, chiffres, _ ou -",
  "guest.submit": "Germer",
  "guest.error.invalid_name": "Ce nom n'est pas valide : 3 à 20 lettres, chiffres, _ ou -.",
  "guest.error.name_taken": "Ce nom est déjà pris.",
  "guest.error.network": "Le serveur est injoignable. Réessaie dans un instant.",

  "res.nutrients": "Nutriments",
  "res.biomass": "Biomasse",
  "res.perSecond": "+{value}/s",
  "res.tiles": "Cases",

  "terrain.litter": "Litière de feuilles",
  "terrain.humus": "Humus",
  "terrain.deadwood": "Bois mort",

  "tile.hint": "Touche une case lumineuse à côté de ton réseau pour la coloniser. Glisse pour te déplacer, pince ou fais défiler pour zoomer.",
  "tile.yield": "Rendement",
  "tile.yieldValue": "{value} nutriments/s",
  "tile.cost": "Coût",
  "tile.growth": "Pousse",
  "tile.colonize": "Coloniser",
  "tile.heart": "Ta spore de départ",
  "tile.owned": "Fait partie de ton réseau",
  "tile.growing": "Les hyphes poussent — encore {time}",
  "tile.notAdjacent": "Hors de portée : colonise d'abord les cases voisines de ton réseau.",
  "tile.close": "Fermer",

  "upgrades.title": "Améliorations",
  "upgrades.level": "Niv. {level}",
  "upgrades.buy": "{cost}",
  "upgrade.digestion.name": "Digestion accrue",
  "upgrade.digestion.desc": "+10 % de rendement sur toutes les cases par niveau.",
  "upgrade.hyphalGrowth.name": "Croissance des hyphes",
  "upgrade.hyphalGrowth.desc": "−8 % de temps de pousse par niveau.",
  "upgrade.thriftyExpansion.name": "Expansion économe",
  "upgrade.thriftyExpansion.desc": "−5 % de coût de colonisation par niveau.",
  "upgrade.biomassConversion.name": "Conversion en biomasse",
  "upgrade.biomassConversion.desc": "+10 % de conversion en biomasse par niveau.",
  "upgrade.woodDecomposer.name": "Décomposeur de bois",
  "upgrade.woodDecomposer.desc": "+15 % de rendement du Bois mort par niveau.",

  "error.unknown_tile": "Cette case n'existe pas.",
  "error.already_owned": "Cette case est déjà à toi.",
  "error.not_adjacent": "Seules les cases voisines de ton réseau peuvent être colonisées.",
  "error.growth_limit": "Tes hyphes poussent déjà ailleurs : attends qu'elles aient fini.",
  "error.not_enough_nutrients": "Pas assez de nutriments.",
  "error.unknown_upgrade": "Amélioration inconnue.",
  "error.not_authenticated": "Tu n'es pas encore connecté.",

  "zoom.in": "Zoomer",
  "zoom.out": "Dézoomer",
  "zoom.home": "Recentrer sur mon réseau",
  "panel.upgrades": "Afficher les améliorations",

  "footer.version": "v{version}",
};

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, fr };

const STORAGE_KEY = "mycelium.lang";
let current: Lang = detectLang();
const listeners = new Set<() => void>();

function detectLang(): Lang {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "fr") return saved;
  } catch {
    // Storage may be blocked; fall back to the browser language.
  }
  const nav = globalThis.navigator?.language ?? "en";
  return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export function lang(): Lang {
  return current;
}

/** BCP-47 locale for number formatting. */
export function locale(): string {
  return current === "fr" ? "fr-FR" : "en-US";
}

export function setLang(next: Lang): void {
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisted, still applied.
  }
  listeners.forEach((l) => l());
}

export function onLangChange(listener: () => void): void {
  listeners.add(listener);
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return interpolate(MESSAGES[current][key], params);
}

export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Fills static elements marked with data-i18n / data-i18n-aria / data-i18n-placeholder. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const text = t(el.dataset.i18nAria as MessageKey);
    el.setAttribute("aria-label", text);
    el.title = text;
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
  });
  document.documentElement.lang = current;
}
