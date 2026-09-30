/**
 * Robots at war (M6): once Enzymes are unlocked, a robot keeps one Glande enzymatique and uses the
 * active actions (GDD §6.2) with a simple greedy policy. Drives the server's test robots and the
 * forest simulations.
 */
import { ACTION_EFFECTS, ACTION_IDS, type ActionId } from "../balance";
import { act, actionCost, checkAct } from "../conflict";
import { atFloor, pressure, tileCounts, type ForestState } from "../forest";
import { RELIC_IDS, TERRAIN_STATS } from "../balance";
import { build, checkBuild, checkColonize, chooseRelic, colonizationCost, colonize, networkHops, tileProduction, type GameState, type Tile } from "../game";
import { hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors } from "../hex";

/** Robots build their Gland once they hold this many tiles (it costs the production of a tile). */
const GLAND_AT_TILES = 20;

/**
 * One war decision of a robot: build a Gland if it has none, then use at most one action, in this
 * order of preference: Assaut, Coupure, Siphon, Toxine. Returns the action used, if any.
 */
export function botAct(forest: ForestState, state: GameState, now: number): { action: ActionId; q: number; r: number; victim: string } | null {
  if (!state.enzymesUnlocked) return null;
  ensureGland(state, now);
  lootRuins(state, now);
  const hops = networkHops(state, now);
  const targets = new Map<string, Tile>();
  for (const k of hops.keys()) {
    for (const n of hexNeighbors(forest.tiles.get(k)!)) {
      const t = forest.tiles.get(hexKey(n));
      if (t && t.owner !== null && t.owner !== state.id && t.growthEndsAt === null) targets.set(hexKey(t), t);
    }
  }
  if (targets.size === 0) return null;
  const counts = tileCounts(forest);
  for (const action of ACTION_IDS) {
    let best: { tile: Tile; score: number } | null = null;
    for (const tile of targets.values()) {
      if (!checkAct(forest, state.id, action, tile, now).ok) continue;
      const score = actionScore(forest, state, action, tile, counts, now) / actionCost(forest, state.id, action, tile, counts);
      if (score > 0 && (!best || score > best.score)) best = { tile, score };
    }
    const victim = best?.tile.owner;
    if (best && victim && act(forest, state.id, action, best.tile, now).ok) return { action, q: best.tile.q, r: best.tile.r, victim };
  }
  return null;
}

/** How much the action is worth on this tile (0: not worth it). */
function actionScore(forest: ForestState, state: GameState, action: ActionId, tile: Tile, counts: Map<string, number>, now: number): number {
  const owner = forest.players.get(tile.owner!)!;
  const ownerHops = networkHops(owner, now);
  const prod = (t: Tile) => (t.owner === owner.id ? tileProduction(owner, t, ownerHops, now) : 0);
  switch (action) {
    case "assault": {
      // Only where the robot already pushes harder than the defender, but not twice as hard.
      if (atFloor(counts, owner.id)) return 0;
      const attack = pressure(forest, state.id, tile, networkHops(state, now));
      const defence = pressure(forest, owner.id, tile);
      if (attack <= defence || attack >= 2 * defence) return 0;
      return prod(tile) + 1;
    }
    case "cut": {
      // Worth it when the cut leaves at least 3 of the owner's tiles without a path to their Cœur.
      if (hexEquals(owner.heart, tile)) return 0;
      tile.effects.push({ kind: "cut", by: state.id, until: now + 1 });
      const after = networkHops(owner, now);
      tile.effects.pop();
      let lost = 0;
      let value = 0;
      for (const k of ownerHops.keys()) {
        if (after.has(k)) continue;
        lost++;
        value += prod(forest.tiles.get(k)!);
      }
      return lost >= 3 ? value : 0;
    }
    case "siphon": {
      let v = 0;
      for (const h of hexesInRadius(tile, ACTION_EFFECTS.siphonRadius)) {
        const t = forest.tiles.get(hexKey(h));
        if (t && hexDistance(h, tile) <= ACTION_EFFECTS.siphonRadius) v += prod(t);
      }
      return v * ACTION_EFFECTS.siphonShare;
    }
    case "toxin": {
      let v = prod(tile);
      for (const n of hexNeighbors(tile)) {
        const t = forest.tiles.get(hexKey(n));
        if (t) v += prod(t);
      }
      return v * 0.5 * 0.25; // Hurting a rival is worth less than gaining.
    }
  }
}

/** Keeps one Gland, on the richest wood tile (not the Cœur), once the colony is big enough. */
function ensureGland(state: GameState, now: number): void {
  const hops = networkHops(state, now);
  if (hops.size < GLAND_AT_TILES) return;
  for (const k of hops.keys()) if (state.tiles.get(k)!.structure === "gland") return;
  let best: Tile | null = null;
  let bestKey = -Infinity;
  for (const k of hops.keys()) {
    const t = state.tiles.get(k)!;
    if (t.structure !== null || hexEquals(t, state.heart) || t.terrain === "rock") continue;
    const wood = t.terrain === "deadwood" || t.terrain === "stump" ? 1_000 : 0;
    const v = wood - tileProduction(state, t, hops, now);
    if (v > bestKey) {
      bestKey = v;
      best = t;
    }
  }
  if (best && checkBuild(state, best, "gland").ok) build(state, best, "gland", now);
}

/**
 * M7 Ruins: a robot plans an adjacent Ruine once it has the Enzymes for it and for an action, and
 * picks its relics in a fixed order of preference.
 */
function lootRuins(state: GameState, now: number): void {
  while (state.relicPicks > 0) {
    const relic = RELIC_IDS.find((r) => !state.relics.includes(r));
    if (!relic || !chooseRelic(state, relic).ok) break;
  }
  for (const t of state.tiles.values()) {
    if (t.terrain !== "ruin" || t.owner !== null || !checkColonize(state, t).ok) continue;
    const cost = colonizationCost(state, t, now);
    if (TERRAIN_STATS.ruin.paidInEnzymes && state.enzymes >= cost + 40) colonize(state, t, now);
    return;
  }
}
