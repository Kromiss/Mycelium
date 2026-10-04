class_name TierSystem
extends RefCounted
## Étape 4 du tick : recalcule le palier de chaque colonie à partir de son nombre de cases
## poussées (GDD §6.1). Perdre des cases peut faire redescendre le palier.


func run(state: GameState, result: TickResult) -> void:
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var tier: int = tier_for(state.defs, colony.cell_count)
		if tier == colony.tier:
			continue
		for reached: int in range(colony.tier, tier):
			if colony.tier_ticks[reached] < 0:
				colony.tier_ticks[reached] = state.tick
		result.tier_changes.append_array(PackedInt32Array([colony.id, colony.tier, tier]))
		result.colony_changed(colony.id)
		colony.tier = tier


## Palier atteint avec ce nombre de cases poussées : nombre de seuils franchis.
static func tier_for(defs: SimDefs, cells: int) -> int:
	var tier: int = 0
	for threshold: int in defs.tier_cells:
		if cells >= threshold:
			tier += 1
	return tier


## Multiplicateur de production du palier, en pour-mille (×1 au départ).
static func production_pm(defs: SimDefs, tier: int) -> int:
	if tier <= 0:
		return Fixed.ONE
	return defs.tier_production_pm[mini(tier, defs.tier_production_pm.size()) - 1]
