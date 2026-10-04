class_name Upgrades
extends RefCounted
## Achat des améliorations du panneau (GDD §9) : par 1, par 10 ou au maximum payable.


## Raison pour laquelle l'achat serait refusé (OK s'il serait accepté) : au moins un niveau
## doit être payable.
static func check_buy(state: GameState, colony: ColonyState, index: int) -> Refusal.Code:
	if index < 0 or index >= state.defs.upgrades.size():
		return Refusal.Code.UNKNOWN_UPGRADE
	if colony.tier < state.defs.upgrades[index].unlock_tier:
		return Refusal.Code.TIER_LOCKED
	var cost: int = ColonyStats.upgrade_cost(state.defs, colony, index)
	if cost < 0:
		return Refusal.Code.MAX_LEVEL
	if cost > colony.nutrients:
		return Refusal.Code.NOT_ENOUGH_NUTRIENTS
	return Refusal.Code.OK


## Achète jusqu'à « count » niveaux (0 : autant que possible) tant qu'ils sont payables.
## Renvoie le nombre de niveaux achetés.
static func buy(state: GameState, colony: ColonyState, index: int, count: int) -> int:
	var bought: int = 0
	while count <= 0 or bought < count:
		var cost: int = ColonyStats.upgrade_cost(state.defs, colony, index)
		if cost < 0 or cost > colony.nutrients:
			break
		colony.nutrients -= cost
		colony.upgrade_levels[index] += 1
		bought += 1
	return bought


## Nombre de niveaux qu'un achat de « count » niveaux (0 : maximum) achèterait, et leur coût
## total en millièmes ([niveaux, coût]), sans rien changer.
static func preview(
	state: GameState, colony: ColonyState, index: int, count: int
) -> PackedInt64Array:
	var level: int = colony.upgrade_levels[index]
	var budget: int = colony.nutrients
	var bought: int = 0
	var total: int = 0
	while count <= 0 or bought < count:
		var cost: int = ColonyStats.upgrade_cost_at(state.defs, colony, index, level + bought)
		if cost < 0 or total + cost > budget:
			break
		total += cost
		bought += 1
	return PackedInt64Array([bought, total])
