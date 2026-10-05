class_name UpgradePlanner
extends RefCounted
## Achats d'améliorations d'un robot : tant que le stock le permet, il prend l'amélioration au
## meilleur rapport poids / coût du prochain niveau ; si elle n'est pas payable, il économise
## pour elle au lieu d'acheter moins bien. Les coûts viennent de ColonyStats (règles de sim/).

## Échelle des notes (poids × échelle / coût), pour comparer en entiers.
const SCORE_SCALE: int = 1 << 40
## Nombre maximal de niveaux prévus en un tick.
const MAX_LEVELS_PER_TICK: int = 200


## Niveaux à acheter ce tick, par rang d'amélioration (rang → nombre de niveaux), dans l'ordre
## des rangs. Ne change rien à la partie.
static func plan(
	state: GameState, colony: ColonyState, profile: RobotProfile
) -> Dictionary[int, int]:
	var defs: SimDefs = state.defs
	var levels: PackedInt32Array = colony.upgrade_levels.duplicate()
	var budget: int = colony.nutrients
	var bought: Dictionary[int, int] = {}
	for _step: int in range(MAX_LEVELS_PER_TICK):
		var best: int = -1
		var best_score: int = -1
		var best_cost: int = 0
		for index: int in range(defs.upgrades.size()):
			var upgrade: SimUpgrade = defs.upgrades[index]
			var weight: int = profile.upgrade_weight(upgrade.id)
			if weight <= 0 or colony.tier < upgrade.unlock_tier:
				continue
			var cost: int = ColonyStats.upgrade_cost_at(defs, colony, index, levels[index])
			if cost < 0:
				continue
			var score: int = weight * SCORE_SCALE / maxi(1, cost)
			if score > best_score:
				best = index
				best_score = score
				best_cost = cost
		if best < 0 or best_cost > budget:
			break
		budget -= best_cost
		levels[best] += 1
		bought[best] = bought.get(best, 0) + 1
	var ordered: Dictionary[int, int] = {}
	for index: int in range(defs.upgrades.size()):
		if bought.has(index):
			ordered[index] = bought[index]
	return ordered
