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


  "auth.title": "Enter the forest",
  "auth.subtitle": "Grow your mycelium against 20 to 30 other colonies sharing one forest.",
  "auth.loginTab": "Sign in",
  "auth.registerTab": "Create an account",
  "auth.nameLabel": "Colony name",
  "auth.namePlaceholder": "e.g. Mycena",
  "auth.nameHint": "3 to 20 letters, digits, _ or -",
  "auth.passwordLabel": "Password",
  "auth.passwordHint": "At least 8 characters",
  "auth.submitLogin": "Sign in",
  "auth.submitRegister": "Create my colony",
  "auth.error.invalid_name": "This name is not valid: use 3 to 20 letters, digits, _ or -.",
  "auth.error.name_taken": "This name is already taken.",
  "auth.error.weak_password": "The password needs at least 8 characters.",
  "auth.error.wrong_credentials": "Wrong name or password.",
  "auth.error.too_many_attempts": "Too many attempts. Wait a few minutes and try again.",
  "auth.error.network": "The server cannot be reached. Try again in a moment.",
  "password.title": "Secure your colony",
  "password.text": "Your colony was created as a guest. Choose a password to sign in from any device.",
  "password.submit": "Save the password",
  "password.later": "Later",
  "password.done": "Password saved.",
  "account.logout": "Sign out",
  "forest.label": "Forest #{number}",
  "board.title": "Leaderboard",
  "board.rank": "#{rank} of {players}",
  "board.global": "Global rank: #{rank} of {players}",
  "board.player": "Colony",
  "board.biomass": "Biomass",
  "board.tiles": "Tiles",
  "board.trophies": "Trophies",
  "board.open": "Show the full leaderboard",
  "board.close": "Close",
  "capture.won": "You took a tile from {name}.",
  "capture.lost": "{name} took one of your tiles.",
  "tile.ownerOther": "Colonized by {name}",
  "tile.underAttack": "{name} is taking it — {percent}",
  "tile.attacking": "You are taking it — {percent}",
  "tile.border": "Border tiles are taken automatically by the network that pushes hardest around them.",
  "away.won": "{count} tiles taken from neighbours",
  "away.lost": "{count} tiles lost at the borders",
  "error.occupied": "Another colony already holds this tile.",
  "error.reserved": "This is the start zone of another colony: it is protected for now.",
  "res.trophies": "Trophies",

  "res.nutrients": "Nutrients",
  "res.biomass": "Biomass",
  "res.perSecond": "+{value}/s",
  "res.tiles": "Tiles",
  "res.queue": "Queue",

  "terrain.wetland": "Wetland",
  "tile.production": "Production",
  "tile.exhaustion": "Exhaustion",
  "tile.transport": "Transport",
  "tile.transportValue": "{hops} hops, −{loss}%",
  "tile.humidity": "Humidity",
  "tile.humidityValue": "+{bonus}% (wetland nearby)",
  "tile.wetland": "Impassable without a mutation. Tiles next to it produce more.",
  "tile.deadwoodNote": "Turns into Humus once exhausted.",
  "tile.queueAdd": "Add to queue ({count}/{max})",
  "tile.queued": "Queued — position {position}",
  "tile.unqueue": "Remove from queue",
  "tile.disconnected": "Cut off from the Heart — lost in {time}",
  "tile.moveHeart": "Move the Heart here",
  "tile.heartReadyIn": "The Heart can move again in {time}",

  "away.title": "While you were away ({time})",
  "away.nutrients": "+{value} nutrients produced",
  "away.biomass": "+{value} biomass",
  "away.colonized": "{count} tiles colonized from the queue",
  "away.reduced": "After 8 h away, production drops to 25%.",
  "away.close": "Back to the forest",

  "error.impassable": "Wetlands cannot be colonized yet.",
  "error.already_queued": "This tile is already in the queue.",
  "error.queue_full": "The expansion queue is full.",
  "error.not_queued": "This tile is not in the queue.",
  "error.not_connected": "The Heart can only move to a tile connected to it.",
  "error.heart_cooldown": "The Heart can only move once a day.",


  "terrain.litter": "Leaf litter",
  "terrain.humus": "Humus",
  "terrain.deadwood": "Dead wood",

  "tile.hint": "Tap a glowing tile to colonize it — you can plan up to 10 in a row. Drag to move, pinch or scroll to zoom.",
  "tile.yield": "Yield",
  "tile.yieldValue": "{value} nutrients/s",
  "tile.cost": "Cost",
  "tile.growth": "Growth",
  "tile.colonize": "Colonize",
  "tile.heart": "The Heart: all nutrients flow here",
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


  "auth.title": "Entre dans la forêt",
  "auth.subtitle": "Fais pousser ton mycélium face à 20 à 30 autres colonies qui partagent la même forêt.",
  "auth.loginTab": "Se connecter",
  "auth.registerTab": "Créer un compte",
  "auth.nameLabel": "Nom de la colonie",
  "auth.namePlaceholder": "ex. Mycena",
  "auth.nameHint": "3 à 20 lettres, chiffres, _ ou -",
  "auth.passwordLabel": "Mot de passe",
  "auth.passwordHint": "Au moins 8 caractères",
  "auth.submitLogin": "Se connecter",
  "auth.submitRegister": "Créer ma colonie",
  "auth.error.invalid_name": "Ce nom n'est pas valide : 3 à 20 lettres, chiffres, _ ou -.",
  "auth.error.name_taken": "Ce nom est déjà pris.",
  "auth.error.weak_password": "Le mot de passe doit faire au moins 8 caractères.",
  "auth.error.wrong_credentials": "Nom ou mot de passe incorrect.",
  "auth.error.too_many_attempts": "Trop d'essais. Attends quelques minutes avant de réessayer.",
  "auth.error.network": "Le serveur est injoignable. Réessaie dans un instant.",
  "password.title": "Sécurise ta colonie",
  "password.text": "Ta colonie a été créée en invité. Choisis un mot de passe pour te connecter depuis n'importe quel appareil.",
  "password.submit": "Enregistrer le mot de passe",
  "password.later": "Plus tard",
  "password.done": "Mot de passe enregistré.",
  "account.logout": "Se déconnecter",
  "forest.label": "Forêt #{number}",
  "board.title": "Classement",
  "board.rank": "{rank}e sur {players}",
  "board.global": "Classement global : {rank}e sur {players}",
  "board.player": "Colonie",
  "board.biomass": "Biomasse",
  "board.tiles": "Cases",
  "board.trophies": "Trophées",
  "board.open": "Voir tout le classement",
  "board.close": "Fermer",
  "capture.won": "Tu as pris une case à {name}.",
  "capture.lost": "{name} t'a pris une case.",
  "tile.ownerOther": "Colonisée par {name}",
  "tile.underAttack": "{name} la prend — {percent}",
  "tile.attacking": "Tu la prends — {percent}",
  "tile.border": "Aux frontières, une case passe d'elle-même au réseau qui pousse le plus fort autour d'elle.",
  "away.won": "{count} cases prises aux voisins",
  "away.lost": "{count} cases perdues aux frontières",
  "error.occupied": "Une autre colonie occupe déjà cette case.",
  "error.reserved": "C'est la zone de départ d'une autre colonie : elle est protégée pour l'instant.",
  "res.trophies": "Trophées",

  "res.nutrients": "Nutriments",
  "res.biomass": "Biomasse",
  "res.perSecond": "+{value}/s",
  "res.tiles": "Cases",
  "res.queue": "File",

  "terrain.wetland": "Zone humide",
  "tile.production": "Production",
  "tile.exhaustion": "Épuisement",
  "tile.transport": "Transport",
  "tile.transportValue": "{hops} sauts, −{loss} %",
  "tile.humidity": "Humidité",
  "tile.humidityValue": "+{bonus} % (zone humide voisine)",
  "tile.wetland": "Infranchissable sans mutation. Les cases voisines produisent davantage.",
  "tile.deadwoodNote": "Devient de l'Humus une fois épuisé.",
  "tile.queueAdd": "Ajouter à la file ({count}/{max})",
  "tile.queued": "Dans la file — position {position}",
  "tile.unqueue": "Retirer de la file",
  "tile.disconnected": "Coupée du Cœur — perdue dans {time}",
  "tile.moveHeart": "Déplacer le Cœur ici",
  "tile.heartReadyIn": "Le Cœur pourra bouger dans {time}",

  "away.title": "Pendant ton absence ({time})",
  "away.nutrients": "+{value} nutriments produits",
  "away.biomass": "+{value} de biomasse",
  "away.colonized": "{count} cases colonisées depuis la file",
  "away.reduced": "Après 8 h d'absence, la production tombe à 25 %.",
  "away.close": "Retour à la forêt",

  "error.impassable": "Les zones humides ne peuvent pas encore être colonisées.",
  "error.already_queued": "Cette case est déjà dans la file.",
  "error.queue_full": "La file d'expansion est pleine.",
  "error.not_queued": "Cette case n'est pas dans la file.",
  "error.not_connected": "Le Cœur ne peut aller que sur une case reliée à lui.",
  "error.heart_cooldown": "Le Cœur ne peut bouger qu'une fois par jour.",


  "terrain.litter": "Litière de feuilles",
  "terrain.humus": "Humus",
  "terrain.deadwood": "Bois mort",

  "tile.hint": "Touche une case lumineuse pour la coloniser — tu peux en planifier jusqu'à 10 à la suite. Glisse pour te déplacer, pince ou fais défiler pour zoomer.",
  "tile.yield": "Rendement",
  "tile.yieldValue": "{value} nutriments/s",
  "tile.cost": "Coût",
  "tile.growth": "Pousse",
  "tile.colonize": "Coloniser",
  "tile.heart": "Le Cœur : tous les nutriments y convergent",
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
