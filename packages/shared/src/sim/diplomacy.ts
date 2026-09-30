/**
 * Robots and pacts (M7), for local tests with robots: a robot accepts every valid invitation, now and
 * then invites a neighbour, and sometimes leaves or betrays its pact, so that alliances form and break
 * during a test week. Deterministic: decisions depend on the forest seed, the robot and the time window.
 */
import { PACTS } from "../balance";
import type { ForestState } from "../forest";
import { isTainted, type GameState } from "../game";
import { hexKey, hexNeighbors } from "../hex";
import { hashFloat } from "../rng";
import { activePact, answerInvite, betray, checkInvite, invite, leavePact, type PactEvent } from "../social";

const HOUR = 3_600_000;
/** A robot considers inviting someone once per window, and breaking its pact once per day. */
const INVITE_WINDOW_MS = 6 * HOUR;
const INVITE_CHANCE = 0.35;
const BREAK_CHANCE = 0.2;
/** Among breaks, this share are betrayals (the rest leave with notice). */
const BETRAY_SHARE = 0.5;

/** One diplomatic decision of a robot; returns what changed, for the other players' alerts. */
export function botDiplomacy(forest: ForestState, bot: GameState, now: number): PactEvent[] {
  const events: PactEvent[] = [];
  // Answer: every invitation still valid is accepted when possible.
  for (const inv of forest.invites.filter((i) => i.to === bot.id && now - i.at < PACTS.inviteMs)) {
    if (bot.pact !== null) break;
    const answer = answerInvite(forest, bot.id, inv.from, true, now);
    if (answer.ok) events.push(answer.event);
  }
  const code = hashCode(bot.id);
  const window = Math.floor(now / INVITE_WINDOW_MS);
  const pact = activePact(forest, bot.id);
  if (!isTainted(bot, now) && (!pact || pact.members.length < PACTS.maxMembers) && !decided(forest, bot, "invite", window)) {
    if (hashFloat(forest.seed ^ code, window, 1) < INVITE_CHANCE) {
      const target = neighbours(forest, bot).find((id) => checkInvite(forest, bot.id, id, now).ok);
      if (target && invite(forest, bot.id, target, now).ok) events.push({ kind: "invited", pact: pact?.id ?? null, player: bot.id, to: [target] });
    }
  }
  const day = Math.floor(now / (24 * HOUR));
  if (pact && pact.leaving[bot.id] === undefined && now - pact.createdAt >= 6 * HOUR && !decided(forest, bot, "break", day)) {
    const roll = hashFloat(forest.seed ^ code, day, 2);
    if (roll < BREAK_CHANCE * BETRAY_SHARE) {
      const result = betray(forest, bot.id, now);
      if (result.ok) events.push(...result.events);
    } else if (roll < BREAK_CHANCE) {
      leavePact(forest, bot.id, now);
    }
  }
  return events;
}

/** Each decision is taken once per window (robots decide every tick). */
const taken = new WeakMap<ForestState, Set<string>>();
function decided(forest: ForestState, bot: GameState, what: string, window: number): boolean {
  let set = taken.get(forest);
  if (!set) {
    set = new Set();
    taken.set(forest, set);
  }
  const key = `${bot.id}|${what}|${window}`;
  if (set.has(key)) return true;
  set.add(key);
  return false;
}

/** Colonies whose tiles touch the robot's, closest first (by number of shared borders). */
function neighbours(forest: ForestState, bot: GameState): string[] {
  const borders = new Map<string, number>();
  for (const t of forest.tiles.values()) {
    if (t.owner !== bot.id) continue;
    for (const n of hexNeighbors(t)) {
      const o = forest.tiles.get(hexKey(n))?.owner;
      if (o && o !== bot.id) borders.set(o, (borders.get(o) ?? 0) + 1);
    }
  }
  return [...borders.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
