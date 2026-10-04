class_name EconomySystem
extends RefCounted
## Étape 5 du tick : production de chaque colonie (GDD §6, §12). Seules les cases poussées et
## reliées au Cœur produisent ; le Cœur produit comme une case normale. Pas de plafond de stock
## en G1 (il arrive avec le Grenier, en G2).


func run(state: GameState, result: TickResult) -> void:
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var produced: int = colony_production(state, colony)
		colony.production = produced
		colony.peak_production = maxi(colony.peak_production, produced)
		colony.nutrients += produced
		colony.biomass += produced
		if produced > 0:
			result.colony_changed(colony.id)


## Production d'une colonie en un tick (millièmes de nutriment) :
## somme des cases reliées au Cœur × multiplicateur du palier.
static func colony_production(state: GameState, colony: ColonyState) -> int:
	var total: int = 0
	for cell: int in range(state.cell_count()):
		if state.connected[cell] == 1 and state.owner[cell] == colony.id:
			total += cell_production(state, colony.id, cell)
	return Fixed.mul(total, TierSystem.production_pm(state.defs, colony.tier))


## Production d'une case avant le multiplicateur du palier :
## rendement × richesse de la zone × (1 + Cohésion × voisines poussées de la même colonie).
static func cell_production(state: GameState, colony_id: int, cell: int) -> int:
	var defs: SimDefs = state.defs
	var base: int = Fixed.mul(defs.cell_yield, defs.zone_richness_pm[state.map.zones[cell] - 1])
	var neighbors: int = state.owned_neighbors(cell, colony_id)
	return Fixed.mul(base, Fixed.ONE + defs.cohesion_per_neighbor_pm * neighbors)


## Production ajoutée par une case libre si elle poussait maintenant pour la colonie (GDD §14.5,
## décidé le 4 octobre 2026) : sa propre production, plus le bonus de Cohésion qu'elle donne à
## ses voisines poussées et reliées de la colonie ; palier actuel compris.
static func added_production(state: GameState, colony_id: int, cell: int) -> int:
	var defs: SimDefs = state.defs
	var colony: ColonyState = state.colony(colony_id)
	var total: int = cell_production(state, colony_id, cell)
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		if other < 0 or state.connected[other] == 0 or state.owner[other] != colony_id:
			continue
		var base: int = Fixed.mul(
			defs.cell_yield, defs.zone_richness_pm[state.map.zones[other] - 1]
		)
		total += Fixed.mul(base, defs.cohesion_per_neighbor_pm)
	return Fixed.mul(total, TierSystem.production_pm(defs, colony.tier))
