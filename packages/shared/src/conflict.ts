import { ACTION_EFFECTS, ACTION_IDS, ACTIONS, ANTI_FRUSTRATION, CENTRE_RISK, type ActionId } from "./balance";
import { atFloor, advanceForest, inCentre, isBullying, isProtected, isStartZone, refreshToxins, tileCounts, type ForestState } from "./forest";
import { hexDistance, hexEquals, hexesInRadius, hexKey, hexNeighbors, type Hex } from "./hex";
import { networkHops, refreshConnections, type ActionResult, type Tile } from "./game";
import { phaseAt } from "./season";
import { isAllied } from "./social";

/**
 * Active actions (GDD §6.2): Assaut, Toxine, Coupure, Siphon. Each one targets an enemy tile touching
 * the caster's connected network, costs Enzymes and has its own cooldown. They leave timed effects on
 * the tiles; game.ts and forest.ts apply them.
 */

export function isActionId(id: string): id is ActionId {
  return (ACTION_IDS as readonly string[]).includes(id);
}

/**
 * Enzymes the action costs `casterId` on this tile: ×3 against a player 3× smaller (GDD §6.4), and a
 * Coupure costs half in the centre (GDD §2.5).
 */
export function actionCost(forest: ForestState, casterId: string, action: ActionId, tile: Tile, counts = tileCounts(forest)): number {
  return actionPrice(action, tile.owner !== null && isBullying(counts, casterId, tile.owner), inCentre(forest, tile));
}

/** The price of an action, knowing whether the target is 3× smaller and whether it lies in the centre. */
export function actionPrice(action: ActionId, bullying: boolean, centre: boolean): number {
  let cost = ACTIONS[action].cost;
  if (bullying) cost *= ANTI_FRUSTRATION.bullyActionCost;
  if (action === "cut" && centre) cost *= CENTRE_RISK.cutCost;
  return cost;
}

/** When the caster can use this action again (in the past if now). */
export function actionReadyAt(forest: ForestState, casterId: string, action: ActionId): number {
  return forest.players.get(casterId)?.cooldowns[action] ?? -Infinity;
}

export function checkAct(forest: ForestState, casterId: string, action: string, h: Hex, now: number): ActionResult {
  const caster = forest.players.get(casterId);
  if (!caster) return { ok: false, error: "unknown_tile" };
  if (!isActionId(action)) return { ok: false, error: "unknown_action" };
  const tile = forest.tiles.get(hexKey(h));
  if (!tile) return { ok: false, error: "unknown_tile" };
  if (tile.owner === null || tile.owner === casterId || tile.growthEndsAt !== null) return { ok: false, error: "not_enemy" };
  const owner = forest.players.get(tile.owner);
  // M7: no active action between allies.
  if (!owner || isAllied(forest, casterId, owner.id)) return { ok: false, error: "not_enemy" };
  if (!caster.enzymesUnlocked) return { ok: false, error: "locked" };
  // GDD §7: no PvP on Monday, and nothing once the season is frozen.
  if (forest.calendar && phaseAt(now).effects.captureSpeed === 0) return { ok: false, error: "no_pvp" };
  const mine = networkHops(caster, now);
  if (!hexNeighbors(tile).some((n) => mine.has(hexKey(n)))) return { ok: false, error: "not_adjacent" };
  if (isStartZone(owner, tile, now)) return { ok: false, error: "protected" };
  if (action === "assault" && (isProtected(forest, tile, now) || atFloor(tileCounts(forest), owner.id))) return { ok: false, error: "protected" };
  if (action === "cut" && (tile.structure === "rhizomorph" || hexEquals(owner.heart, tile))) return { ok: false, error: "uncuttable" };
  if (now < actionReadyAt(forest, casterId, action)) return { ok: false, error: "action_cooldown" };
  if (caster.enzymes < actionCost(forest, casterId, action, tile)) return { ok: false, error: "not_enough_enzymes" };
  return { ok: true };
}

/** Uses an active action; the forest is first brought up to `now`. */
export function act(forest: ForestState, casterId: string, action: string, h: Hex, now: number): ActionResult {
  advanceForest(forest, now);
  const check = checkAct(forest, casterId, action, h, now);
  if (!check.ok || !isActionId(action)) return check;
  const caster = forest.players.get(casterId)!;
  const tile = forest.tiles.get(hexKey(h))!;
  const victim = forest.players.get(tile.owner!)!;
  const until = now + ACTIONS[action].durationMs;

  caster.enzymes -= actionCost(forest, casterId, action, tile);
  caster.cooldowns[action] = now + ACTIONS[action].cooldownMs;

  const mark = (t: Tile) => {
    t.effects = t.effects.filter((e) => !(e.kind === action && e.by === casterId));
    t.effects.push({ kind: action, by: casterId, until });
  };
  if (action === "assault" || action === "cut") mark(tile);
  else {
    // Toxine: the tile and its neighbours; Siphon: every tile within 2. Only the victim's grown tiles.
    const radius = action === "toxin" ? 1 : ACTION_EFFECTS.siphonRadius;
    for (const n of hexesInRadius(tile, radius)) {
      const t = forest.tiles.get(hexKey(n));
      if (t && t.owner === victim.id && t.growthEndsAt === null && hexDistance(n, tile) <= radius) mark(t);
    }
  }
  if (action === "cut") refreshConnections(victim, now);
  refreshToxins(forest);
  return check;
}
