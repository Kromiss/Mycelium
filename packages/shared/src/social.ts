/**
 * Pactes de symbiose, chemical Signals and listening (GDD §3, §6.3; M7, DECIDED: the proposed package).
 * Pacts live in the forest; each member's `pact` and `allies` are derived from them by `refreshPacts`.
 */
import { PACTS, SIGNALS } from "./balance";
import { biomassConversion, effectsAt, isTainted, type ActionError, type ActionResult, type GameState } from "./game";
import type { ForestState } from "./forest";

export interface Pact {
  id: string;
  /** Current members, in the order they joined. */
  members: string[];
  /** Players who were in the pact and left it (for the alliance leaderboard). */
  former: string[];
  createdAt: number;
  /** When the pact fell under two members, null while it lives. */
  endedAt: number | null;
  /** Members leaving with notice: when they leave (ms since epoch). */
  leaving: Record<string, number>;
  /** Each member's biomass when they joined: what they earned since counts for the pact. */
  marks: Record<string, number>;
  /** Biomass earned by members who already left, and by the pact before it ended. */
  banked: number;
}

/** `from` asks `to` to join them: into their pact, or into a new pact of two. */
export interface PactInvite {
  from: string;
  to: string;
  at: number;
}

/** What changed in the pacts, for alerts and the night journal. */
export interface PactEvent {
  kind: "invited" | "formed" | "joined" | "left" | "betrayed" | "ended" | "declined";
  pact: string | null;
  /** Who did it (the inviter, the newcomer, the leaver, the traitor). */
  player: string;
  /** Who is told. */
  to: string[];
}

export function activePact(forest: ForestState, playerId: string): Pact | undefined {
  return forest.pacts.find((p) => p.endedAt === null && p.members.includes(playerId));
}

export function isAllied(forest: ForestState, a: string, b: string): boolean {
  if (a === b) return false;
  const pa = forest.players.get(a)?.pact;
  return pa !== null && pa !== undefined && pa === forest.players.get(b)?.pact;
}

/** Sets every player's `pact` and `allies` from the forest's pacts. */
export function refreshPacts(forest: ForestState): void {
  for (const p of forest.players.values()) {
    p.pact = null;
    p.allies = [];
  }
  for (const pact of forest.pacts) {
    if (pact.endedAt !== null) continue;
    for (const id of pact.members) {
      const p = forest.players.get(id);
      if (!p) continue;
      p.pact = pact.id;
      p.allies = pact.members.filter((m) => m !== id);
    }
  }
}

/** Biomass earned by the pact's members while in it (the alliance score, M7). */
export function allianceScore(forest: ForestState, pact: Pact): number {
  let score = pact.banked;
  for (const id of pact.members) score += Math.max(0, (forest.players.get(id)?.biomass ?? 0) - (pact.marks[id] ?? 0));
  return score;
}

/** Hands each pact's pot to its members, equally (production and the biomass it gives each of them at `at`). */
export function settlePacts(forest: ForestState, at: number): void {
  for (const pact of forest.pacts) {
    if (pact.endedAt !== null) continue;
    const members = pact.members.map((id) => forest.players.get(id)).filter((p): p is GameState => p !== undefined);
    const pot = members.reduce((sum, p) => sum + p.pactGiven, 0);
    if (pot <= 0 || members.length === 0) continue;
    const share = pot / members.length;
    for (const p of members) {
      p.nutrients += share;
      p.biomass += share * biomassConversion(p) * effectsAt(p, at).biomass;
    }
  }
  for (const p of forest.players.values()) p.pactGiven = 0;
}

// ---------------------------------------------------------------------------
// Invitations

export function checkInvite(forest: ForestState, from: string, to: string, now: number): ActionResult {
  const inviter = forest.players.get(from);
  const target = forest.players.get(to);
  if (!inviter || !target) return { ok: false, error: "unknown_player" };
  if (from === to) return { ok: false, error: "self" };
  if (isTainted(inviter, now)) return { ok: false, error: "tainted" };
  if (target.pact !== null) return { ok: false, error: "in_pact" };
  const pact = activePact(forest, from);
  if (pact && pact.members.length >= PACTS.maxMembers) return { ok: false, error: "pact_full" };
  if (forest.invites.some((i) => i.from === from && i.to === to && now - i.at < PACTS.inviteMs)) return { ok: false, error: "already_invited" };
  return { ok: true };
}

export function invite(forest: ForestState, from: string, to: string, now: number): ActionResult {
  const check = checkInvite(forest, from, to, now);
  if (!check.ok) return check;
  forest.invites.push({ from, to, at: now });
  return check;
}

/** Invitations still valid that involve the player. */
export function invitesOf(forest: ForestState, playerId: string, now: number): PactInvite[] {
  return forest.invites.filter((i) => (i.from === playerId || i.to === playerId) && now - i.at < PACTS.inviteMs);
}

/**
 * `to` answers `from`'s invitation. Accepting joins `from`'s pact, or forms a new pact of two; the
 * rules are checked again (sizes, pacts and stains may have changed since the invitation).
 */
export function answerInvite(forest: ForestState, to: string, from: string, accept: boolean, now: number): { ok: true; event: PactEvent } | { ok: false; error: ActionError } {
  const index = forest.invites.findIndex((i) => i.from === from && i.to === to && now - i.at < PACTS.inviteMs);
  if (index < 0) return { ok: false, error: "no_invite" };
  if (!accept) {
    forest.invites.splice(index, 1);
    return { ok: true, event: { kind: "declined", pact: null, player: to, to: [from] } };
  }
  const target = forest.players.get(to);
  const inviter = forest.players.get(from);
  if (!target || !inviter) return { ok: false, error: "unknown_player" };
  if (isTainted(target, now) || isTainted(inviter, now)) return { ok: false, error: "tainted" };
  if (target.pact !== null) return { ok: false, error: "in_pact" };
  forest.invites.splice(index, 1);
  let pact = activePact(forest, from);
  let event: PactEvent;
  if (pact) {
    if (pact.members.length >= PACTS.maxMembers) return { ok: false, error: "pact_full" };
    pact.members.push(to);
    pact.marks[to] = target.biomass;
    event = { kind: "joined", pact: pact.id, player: to, to: pact.members.filter((m) => m !== to) };
  } else {
    pact = {
      id: `pact-${forest.pacts.length + 1}`,
      members: [from, to],
      former: [],
      createdAt: now,
      endedAt: null,
      leaving: {},
      marks: { [from]: inviter.biomass, [to]: target.biomass },
      banked: 0,
    };
    forest.pacts.push(pact);
    event = { kind: "formed", pact: pact.id, player: to, to: [from] };
  }
  // One pact per player: the newcomer's other invitations to join someone are dropped.
  forest.invites = forest.invites.filter((i) => i.to !== to);
  refreshPacts(forest);
  return { ok: true, event };
}

// ---------------------------------------------------------------------------
// Leaving and betrayal

/** Leaves with notice: the player stays allied for an hour, then leaves without penalty. */
export function leavePact(forest: ForestState, playerId: string, now: number): ActionResult {
  const pact = activePact(forest, playerId);
  if (!pact) return { ok: false, error: "not_in_pact" };
  if (pact.leaving[playerId] !== undefined) return { ok: false, error: "already_leaving" };
  pact.leaving[playerId] = now + PACTS.leaveNoticeMs;
  return { ok: true };
}

/** Breaks the pact at once: a betrayal, and a "Réseau tâché" for a day (GDD §6.3). */
export function betray(forest: ForestState, playerId: string, now: number): { ok: true; events: PactEvent[] } | { ok: false; error: "not_in_pact" } {
  const pact = activePact(forest, playerId);
  if (!pact) return { ok: false, error: "not_in_pact" };
  const others = pact.members.filter((m) => m !== playerId);
  const events: PactEvent[] = [{ kind: "betrayed", pact: pact.id, player: playerId, to: others }];
  removeMember(forest, pact, playerId, now, events);
  const traitor = forest.players.get(playerId);
  if (traitor) traitor.taintedUntil = now + PACTS.taintMs;
  // A traitor's invitations are void.
  forest.invites = forest.invites.filter((i) => i.from !== playerId);
  refreshPacts(forest);
  return { ok: true, events };
}

/** Members whose notice is over leave; expired invitations are dropped. Returns what changed. */
export function resolvePacts(forest: ForestState, now: number): PactEvent[] {
  const events: PactEvent[] = [];
  for (const pact of forest.pacts) {
    if (pact.endedAt !== null) continue;
    for (const [id, at] of Object.entries(pact.leaving)) {
      if (at > now || !pact.members.includes(id)) continue;
      events.push({ kind: "left", pact: pact.id, player: id, to: pact.members.filter((m) => m !== id) });
      removeMember(forest, pact, id, at, events);
      if (pact.endedAt !== null) break;
    }
  }
  const before = forest.invites.length;
  forest.invites = forest.invites.filter((i) => now - i.at < PACTS.inviteMs && forest.players.has(i.from) && forest.players.has(i.to));
  if (events.length > 0 || before !== forest.invites.length) refreshPacts(forest);
  return events;
}

function removeMember(forest: ForestState, pact: Pact, id: string, now: number, events: PactEvent[]): void {
  pact.banked += Math.max(0, (forest.players.get(id)?.biomass ?? 0) - (pact.marks[id] ?? 0));
  pact.members = pact.members.filter((m) => m !== id);
  if (!pact.former.includes(id)) pact.former.push(id);
  delete pact.marks[id];
  delete pact.leaving[id];
  if (pact.members.length < 2) {
    // A pact of one is over: the last member leaves too, without penalty.
    for (const last of pact.members) {
      pact.banked += Math.max(0, (forest.players.get(last)?.biomass ?? 0) - (pact.marks[last] ?? 0));
      if (!pact.former.includes(last)) pact.former.push(last);
      events.push({ kind: "ended", pact: pact.id, player: id, to: [last] });
    }
    pact.members = [];
    pact.marks = {};
    pact.leaving = {};
    pact.endedAt = now;
  }
}

// ---------------------------------------------------------------------------
// Signals: sending to allies and listening (GDD §3)

export type SendResource = "nutrients" | "enzymes";

export function checkSend(forest: ForestState, from: string, to: string, resource: string, amount: number): ActionResult {
  const sender = forest.players.get(from);
  if (!sender || !forest.players.has(to)) return { ok: false, error: "unknown_player" };
  if (!isAllied(forest, from, to)) return { ok: false, error: "not_ally" };
  if (resource !== "nutrients" && resource !== "enzymes") return { ok: false, error: "invalid_amount" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid_amount" };
  if (sender.signals < SIGNALS.sendCost) return { ok: false, error: "not_enough_signals" };
  if ((resource === "nutrients" ? sender.nutrients : sender.enzymes) < amount) {
    return { ok: false, error: resource === "nutrients" ? "not_enough_nutrients" : "not_enough_enzymes" };
  }
  return { ok: true };
}

/** Sends Nutrients or Enzymes to an ally: one Signal, and 5 % lost on the way. */
export function sendResource(forest: ForestState, from: string, to: string, resource: string, amount: number): ActionResult {
  const check = checkSend(forest, from, to, resource, amount);
  if (!check.ok) return check;
  const sender = forest.players.get(from)!;
  const receiver = forest.players.get(to)!;
  sender.signals -= SIGNALS.sendCost;
  const received = amount * (1 - SIGNALS.sendLoss);
  if (resource === "nutrients") {
    sender.nutrients -= amount;
    receiver.nutrients += received;
  } else {
    sender.enzymes -= amount;
    receiver.enzymes += received;
  }
  return check;
}

export function checkListen(forest: ForestState, from: string, target: string): ActionResult {
  const listener = forest.players.get(from);
  if (!listener || !forest.players.has(target)) return { ok: false, error: "unknown_player" };
  if (from === target) return { ok: false, error: "self" };
  if (listener.signals < SIGNALS.listenCost) return { ok: false, error: "not_enough_signals" };
  return { ok: true };
}

/** Listens to a colony: its whole network is visible through the fog for an hour. */
export function listen(forest: ForestState, from: string, target: string, now: number): ActionResult {
  const check = checkListen(forest, from, target);
  if (!check.ok) return check;
  const listener = forest.players.get(from)!;
  listener.signals -= SIGNALS.listenCost;
  listener.listens[target] = Math.max(listener.listens[target] ?? now, now) + SIGNALS.listenMs;
  return check;
}

/** Drops listenings that are over. */
export function pruneListens(forest: ForestState, at: number): void {
  for (const p of forest.players.values()) {
    for (const [id, until] of Object.entries(p.listens)) if (until <= at) delete p.listens[id];
  }
}
