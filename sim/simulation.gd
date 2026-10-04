class_name Simulation
extends RefCounted
## Point d'entrée des règles du jeu (Architecture §4) : tick(commandes) -> TickResult.
## Code pur et déterministe : même graine, mêmes définitions et mêmes commandes donnent
## la même partie, au bit près. Ne connaît ni l'affichage, ni le réseau, ni les robots.

## État de la partie. L'affichage le lit, mais seule la simulation le modifie.
var state: GameState

var _commands := CommandSystem.new()
var _growth := GrowthSystem.new()
var _tiers := TierSystem.new()
var _economy := EconomySystem.new()


## Crée une partie : forêt de « defs », « colony_count » colonies (une par secteur, dans
## l'ordre des secteurs ; moins de colonies que de secteurs en Bac à sable), stock de départ.
func _init(defs: SimDefs, game_seed: int, colony_count: int = -1) -> void:
	var problems: PackedStringArray = defs.validate()
	assert(problems.is_empty(), "Définitions invalides : %s" % ", ".join(problems))
	var count: int = defs.sectors if colony_count < 0 else colony_count
	assert(count >= 1 and count <= defs.sectors, "Nombre de colonies hors limites.")
	state = GameState.new()
	state.game_seed = game_seed
	state.rng = SimRng.new(game_seed)
	state.map = MapGenerator.generate_shape(defs.rings_per_zone, defs.zone_count())
	state.defs = defs
	defs.prepare(state.map.size())
	var size: int = state.map.size()
	state.owner.resize(size)
	state.owner.fill(-1)
	state.cell_state.resize(size)
	state.growth_left.resize(size)
	state.connected.resize(size)
	for sector: int in range(count):
		_place_colony(sector)
	state.recompute_network()
	for colony: ColonyState in state.colonies:
		colony.tier = TierSystem.tier_for(defs, colony.cell_count)


## Joue un tick avec les commandes reçues depuis le précédent. Ordre fixe des systèmes.
func tick(commands: Array[Command] = []) -> TickResult:
	var result := TickResult.new()
	result.tick = state.tick
	_commands.run(state, commands, result)
	_growth.run(state, result)
	_tiers.run(state, result)
	_economy.run(state, result)
	state.tick += 1
	result.state_hash = StateHash.compute(state)
	return result


## Empreinte de l'état actuel.
func state_hash() -> int:
	return StateHash.compute(state)


# --- Requêtes pour l'interface et les robots (lecture seule) ---


## Numéro d'une case, ou −1 hors de la forêt.
func cell_index(cell: Vector2i) -> int:
	return state.map.index_of(cell)


## Coût de colonisation d'une case pour une colonie, en millièmes (−1 hors de la forêt).
func colonize_cost(colony_id: int, cell: Vector2i) -> int:
	var index: int = cell_index(cell)
	var colony: ColonyState = state.colony(colony_id)
	if index < 0 or colony == null:
		return -1
	return Expansion.cost(state, colony, index)


## Durée de pousse d'une case, en secondes (−1 hors de la forêt).
func growth_ticks(cell: Vector2i) -> int:
	var index: int = cell_index(cell)
	return -1 if index < 0 else Expansion.growth_ticks(state, index)


## Raison pour laquelle un clic direct serait refusé (OK s'il serait accepté).
func check_colonize(colony_id: int, cell: Vector2i) -> Refusal.Code:
	var colony: ColonyState = state.colony(colony_id)
	if colony == null or not colony.alive:
		return Refusal.Code.UNKNOWN_COLONY
	return Expansion.check_colonize(state, colony, cell_index(cell))


## Raison pour laquelle un ajout à la file serait refusé (OK s'il serait accepté).
func check_enqueue(colony_id: int, cell: Vector2i) -> Refusal.Code:
	var colony: ColonyState = state.colony(colony_id)
	if colony == null or not colony.alive:
		return Refusal.Code.UNKNOWN_COLONY
	return Expansion.check_enqueue(state, colony, cell_index(cell))


## Production d'une case pour une colonie, en millièmes par seconde, palier compris : ce
## qu'elle rapporte si elle lui appartient, ou rapporterait une fois poussée sinon.
func cell_production(colony_id: int, cell: Vector2i) -> int:
	var index: int = cell_index(cell)
	var colony: ColonyState = state.colony(colony_id)
	if index < 0 or colony == null:
		return -1
	var base: int = EconomySystem.cell_production(state, colony_id, index)
	return Fixed.mul(base, TierSystem.production_pm(state.defs, colony.tier))


func _place_colony(sector: int) -> void:
	var colony := ColonyState.new()
	colony.id = state.colonies.size()
	colony.sector = sector
	colony.nutrients = state.defs.start_stock()
	for cell: Vector2i in MapGenerator.start_cells(state.map.radius, sector, state.defs.sectors):
		var index: int = state.map.index_of(cell)
		state.owner[index] = colony.id
		state.cell_state[index] = GameState.CellState.OWNED
		colony.cell_count += 1
		if colony.heart < 0:
			colony.heart = index
	state.colonies.append(colony)
