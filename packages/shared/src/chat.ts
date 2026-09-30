/**
 * Forest chat and private messages (M7, decided: in-game chat + private messages, no Discord).
 * Pure rules: message cleaning, anti-spam and the texts of browser notifications. The server stores
 * and routes the messages.
 */

export const CHAT_CHANNELS = ["forest", "pact", "dm"] as const;
/** forest: everybody in the forest; pact: the members of the player's pact; dm: one other player. */
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

export const CHAT = {
  /** Characters per message. */
  maxLength: 500,
  /** At most `burst` messages per `windowMs` (real time). */
  burst: 5,
  windowMs: 10_000,
  /** The same text as the player's previous message is refused for this long. */
  repeatMs: 5 * 60_000,
  /** Messages sent to a player when they connect (per forest, all channels they can read). */
  history: 150,
  /** An admin cuts a player's chat for this long. */
  silenceMs: 24 * 3_600_000,
} as const;

export interface ChatMessage {
  id: number;
  channel: ChatChannel;
  from: string;
  fromName: string;
  /** Recipient of a private message. */
  to?: string;
  /** Game time. */
  at: number;
  text: string;
}

export type ChatError = "empty" | "too_long" | "rate_limited" | "repeated" | "silenced" | "unknown_player" | "no_pact" | "self";

/**
 * The text as it is kept: control characters and line breaks become spaces, runs of spaces are
 * collapsed, and the ends are trimmed. Returns an error for an empty or too long message.
 */
export function cleanChatText(raw: string): { ok: true; text: string } | { ok: false; error: ChatError } {
  const text = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length === 0) return { ok: false, error: "empty" };
  if ([...text].length > CHAT.maxLength) return { ok: false, error: "too_long" };
  return { ok: true, text };
}

/** Anti-spam memory of one player (real time). */
export interface ChatGuard {
  sent: number[];
  last: { text: string; at: number } | null;
}

export const newChatGuard = (): ChatGuard => ({ sent: [], last: null });

/** Whether the player may send `text` now; records it when allowed. */
export function guardChat(guard: ChatGuard, text: string, now: number): ChatError | null {
  guard.sent = guard.sent.filter((at) => now - at < CHAT.windowMs);
  if (guard.sent.length >= CHAT.burst) return "rate_limited";
  const same = text.toLowerCase();
  if (guard.last && guard.last.text === same && now - guard.last.at < CHAT.repeatMs) return "repeated";
  guard.sent.push(now);
  guard.last = { text: same, at: now };
  return null;
}

/** Whether `playerId` may read `m` (their pact is `pactId`, null without one). */
export function canReadChat(m: Pick<ChatMessage, "channel" | "from" | "to"> & { pact?: string | null }, playerId: string, pactId: string | null): boolean {
  switch (m.channel) {
    case "forest":
      return true;
    case "dm":
      return m.from === playerId || m.to === playerId;
    case "pact":
      return pactId !== null && m.pact === pactId;
  }
}

// ---------------------------------------------------------------------------
// Browser notifications (M7, decided: browser push only, opt-in, at most one per kind every 30 min)

export const PUSH_KINDS = ["attacked", "heart", "boss", "seasonEnd", "dm"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const PUSH = {
  /** At most one notification of a kind per player this often (game time). */
  throttleMs: 30 * 60_000,
  /** Characters of a private message shown in the notification. */
  preview: 120,
} as const;

export type PushLang = "en" | "fr";

const PUSH_TEXTS: Record<PushLang, Record<PushKind, string>> = {
  en: {
    attacked: "{name} is pushing on your border.",
    heart: "{name} is attacking your Heart!",
    boss: "A Dying tree falls in the centre of the forest in an hour.",
    seasonEnd: "The season ends in less than an hour: last push!",
    dm: "{name}: {text}",
  },
  fr: {
    attacked: "{name} attaque ta frontière.",
    heart: "{name} s'en prend à ton Cœur !",
    boss: "Un Arbre mourant tombe au centre de la forêt dans une heure.",
    seasonEnd: "La saison se termine dans moins d'une heure : dernier effort !",
    dm: "{name} : {text}",
  },
};

export function isPushKind(v: unknown): v is PushKind {
  return typeof v === "string" && (PUSH_KINDS as readonly string[]).includes(v);
}

/** Title and text of a notification, in the language the player chose when enabling them. */
export function pushText(kind: PushKind, lang: PushLang, params: { name?: string; text?: string } = {}): { title: string; body: string } {
  const text = params.text && [...params.text].length > PUSH.preview ? `${[...params.text].slice(0, PUSH.preview - 1).join("")}…` : (params.text ?? "");
  const body = PUSH_TEXTS[lang][kind].replace("{name}", params.name ?? "?").replace("{text}", text);
  return { title: "Mycelium", body };
}
