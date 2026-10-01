/** Test helpers shared by the rule tests (not exported by the package). */
import { BORDERS } from "./balance";
import { captureSpeed, cohesionDefence, pressure, type ForestState } from "./forest";
import { networkHops } from "./game";
import { hexKey, type Hex } from "./hex";

/**
 * Time for `attacker` to take the tile at `h` by border pressure alone, before any other multiplier:
 * the terrain's capture time, slowed by the defender's cohesion (M8) and by a pressure ratio under 2.
 */
export function plainCaptureMs(f: ForestState, attacker: string, h: Hex): number {
  const tile = f.tiles.get(hexKey(h))!;
  const { pushBack, hold } = cohesionDefence(f, tile);
  const attack = pressure(f, attacker, tile, networkHops(f.players.get(attacker)!)) * pushBack;
  const speed = captureSpeed(attack, pressure(f, tile.owner!, tile));
  return (BORDERS.captureMs[tile.terrain] * hold) / speed;
}
