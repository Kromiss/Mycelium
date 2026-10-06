class_name Simulation
extends RefCounted
## Point d'entrée des règles du jeu (Architecture §4) : tick(commandes) -> TickResult.
## Code pur et déterministe : même graine, mêmes définitions et mêmes commandes donnent
## la même partie, au bit près. Ne connaît ni l'affichage, ni le réseau, ni les robots.

## État de la partie. L'affichage le lit, mais seule la simulation le modifie.
var state: GameState

var _commands := CommandSystem.new()
var _turrets := TurretSystem.new()
var _regen := RegenSystem.new()
var _tiers := TierSystem.new()
var _economy := EconomySystem.new()
var _victory := VictorySystem.new()


## Crée une partie : forêt de « defs », « colony_count » colonies (une par secteur, dans
## l'ordre des secteurs ; moins de colonies que de secteurs en Bac à sable), Tourelles sur
## les coins de la forêt. « sector_list » : secteur de chaque colonie, dans l'ordre des
## colonies (vide : les premiers secteurs ; il fixe alors le nombre de colonies).
func _init(
	defs: SimDefs, game_seed: int, colony_count: int = -1, sector_list := PackedInt32Array()
) -> void:
	var problems: PackedStringArray = defs.validate()
	assert(problems.is_empty(), "Définitions invalides : %s" % ", ".join(problems))
	var count: int = defs.sectors if colony_count < 0 else colony_count
	if not sector_list.is_empty():
		count = sector_list.size()
	assert(count >= 1 and count <= defs.sectors, "Nombre de colonies hors limites.")
	defs.prepare()
	state = GameState.new()
	state.game_seed = game_seed
	state.rng = SimRng.new(game_seed)
	state.map = MapGenerator.generate_shape(defs.rings_per_zone, defs.zone_count())
	state.defs = defs
	state.start_colonies = count
	var size: int = state.map.size()
	state.owner.resize(size)
	state.owner.fill(-1)
	state.hp.resize(size)
	state.last_hitter.resize(size)
	state.last_hitter.fill(-1)
	state.no_regen_until.resize(size)
	state.building_at.resize(size)
	state.building_at.fill(-1)
	state.cell_rank = _shuffled_ranks(size)
	state.cell_by_rank.resize(size)
	for cell: int in range(size):
		state.cell_by_rank[state.cell_rank[cell]] = cell
	for cell: int in range(size):
		state.hp[cell] = ColonyStats.free_max_hp(state, cell)
	for index: int in range(count):
		var sector: int = sector_list[index] if not sector_list.is_empty() else index
		assert(sector >= 0 and sector < defs.sectors, "Secteur hors de la forêt.")
		_place_colony(sector)
	# Les PV des cases de départ dépendent de leurs voisines : calculés une fois tout placé.
	for colony: ColonyState in state.colonies:
		for cell: int in range(size):
			if state.owner[cell] == colony.id:
				state.hp[cell] = ColonyStats.cell_max_hp(state, cell)
		colony.turret_hp = ColonyStats.turret_max_hp(defs, colony)
		colony.tier = ColonyStats.tier_for(defs, colony.cell_count)


## Joue un tick avec les commandes reçues depuis le précédent. Ordre fixe des systèmes.
func tick(commands: Array[Command] = []) -> TickResult:
	var result := TickResult.new()
	result.tick = state.tick
	if state.finished:
		# Partie terminée : l'état ne bouge plus, les commandes sont refusées.
		for command: Command in commands:
			result.refuse(command, Refusal.Code.GAME_OVER)
		result.finished = true
		result.state_hash = StateHash.compute(state)
		return result
	_commands.run(state, commands, result)
	Buildings.update(state, result)
	_turrets.run(state, result)
	_regen.run(state, result)
	_tiers.run(state, result)
	_economy.run(state, result)
	_victory.run(state, state.tick + 1, result)
	state.tick += 1
	result.state_hash = StateHash.compute(state)
	return result


## Joue tout de suite, entre deux ticks, des commandes du joueur local (décidé le 5 octobre
## 2026 : en partie locale, un ordre prend effet au clic). Seule l'étape des commandes est jouée
## (pas de tir, de production…) ; le tick suivant se déroule ensuite normalement. Le rejeu
## rejoue ces commandes au même moment (Replay.record_early()).
func apply_now(commands: Array[Command]) -> TickResult:
	var result := TickResult.new()
	result.tick = state.tick
	if state.finished:
		for command: Command in commands:
			result.refuse(command, Refusal.Code.GAME_OVER)
		result.finished = true
	else:
		_commands.run(state, commands, result)
	result.state_hash = StateHash.compute(state)
	return result


## Empreinte de l'état actuel.
func state_hash() -> int:
	return StateHash.compute(state)


# --- Requêtes pour l'interface et les robots (lecture seule) ---


## Numéro d'une case, ou −1 hors de la forêt.
func cell_index(cell: Vector2i) -> int:
	return state.map.index_of(cell)


## Raison pour laquelle une commande serait refusée si elle était jouée maintenant
## (OK si elle serait acceptée). La colonie est celle de la commande.
func check(command: Command) -> Refusal.Code:
	return CommandSystem.check(state, command)


## PV max d'une case (libre ou possédée), en millièmes.
func cell_max_hp(cell: int) -> int:
	return ColonyStats.cell_max_hp(state, cell)


## Vrai si la case est dans le cercle de portée de la Tourelle de la colonie.
func in_range(colony_id: int, cell: int) -> bool:
	var colony: ColonyState = state.colony(colony_id)
	return colony != null and colony.alive and Targeting.in_range(state, colony, cell)


## Vrai si la colonie peut désigner la case au clic : son Sporophore (prise ou soin) ou un de
## ses bâtiments actifs peut la viser.
func is_target(colony_id: int, cell: int) -> bool:
	var colony: ColonyState = state.colony(colony_id)
	if colony == null or not colony.alive:
		return false
	return Targeting.check_designation(state, colony, cell) == Refusal.Code.OK


## Raison pour laquelle la colonie ne pourrait poser ce bâtiment nulle part (OK si elle le
## pourrait sur une case convenable) : débloqué, une place libre, payable.
func check_building_type(colony_id: int, building: StringName) -> Refusal.Code:
	var colony: ColonyState = state.colony(colony_id)
	if colony == null or not colony.alive:
		return Refusal.Code.UNKNOWN_COLONY
	if state.finished:
		return Refusal.Code.GAME_OVER
	return Buildings.check_type(state, colony, state.defs.building_index(building))


## Places de bâtiment de la colonie : [prises, total] (GDD §5 bis).
func building_slots(colony_id: int) -> PackedInt32Array:
	var colony: ColonyState = state.colony(colony_id)
	if colony == null:
		return PackedInt32Array([0, 0])
	return PackedInt32Array(
		[
			Buildings.standing_count(state, colony_id),
			ColonyStats.building_slots(state.defs, colony),
		]
	)


## Bâtiment posé sur une case (endormi compris), ou null.
func building_on(cell: int) -> BuildingState:
	return state.building_on(cell) if cell >= 0 else null


## PV max d'un bâtiment, en millièmes (pour son propriétaire actuel).
func building_max_hp(building: BuildingState) -> int:
	var owner: ColonyState = state.colony(building.owner)
	if owner == null:
		return state.defs.buildings[building.type].hp
	return ColonyStats.building_max_hp(state.defs, owner, building.type)


## Portée d'un bâtiment, en cases (pour son propriétaire actuel).
func building_reach(building: BuildingState) -> int:
	var owner: ColonyState = state.colony(building.owner)
	if owner == null:
		return state.defs.buildings[building.type].reach
	return ColonyStats.building_reach(state.defs, owner, building.type)


## Coût du prochain niveau d'une amélioration pour la colonie, en millièmes
## (−1 : niveau maximal atteint ou amélioration inconnue).
func upgrade_cost(colony_id: int, upgrade: StringName) -> int:
	var colony: ColonyState = state.colony(colony_id)
	var index: int = state.defs.upgrade_index(upgrade)
	if colony == null or index < 0:
		return -1
	return ColonyStats.upgrade_cost(state.defs, colony, index)


## Ce qu'achèterait un achat de « count » niveaux (0 : maximum) : [niveaux, coût total].
func upgrade_preview(colony_id: int, upgrade: StringName, count: int) -> PackedInt64Array:
	var colony: ColonyState = state.colony(colony_id)
	var index: int = state.defs.upgrade_index(upgrade)
	if colony == null or index < 0:
		return PackedInt64Array([0, 0])
	return Upgrades.preview(state, colony, index, count)


## Valeur de la statistique d'une amélioration avant et après « levels » niveaux de plus :
## [avant, après] (unités de ColonyStats.stat_value()), sans rien changer à la partie.
func upgrade_values(colony_id: int, upgrade: StringName, levels: int) -> PackedInt64Array:
	var colony: ColonyState = state.colony(colony_id)
	var index: int = state.defs.upgrade_index(upgrade)
	if colony == null or index < 0:
		return PackedInt64Array([0, 0])
	var stat: int = state.defs.upgrades[index].stat
	var before: int = ColonyStats.stat_value(state, colony, stat)
	var copy: ColonyState = colony.stats_copy()
	copy.upgrade_levels[index] += levels
	return PackedInt64Array([before, ColonyStats.stat_value(state, copy, stat)])


func _place_colony(sector: int) -> void:
	var defs: SimDefs = state.defs
	var colony := ColonyState.new()
	colony.id = state.colonies.size()
	colony.sector = sector
	colony.nutrients = defs.start_stock()
	colony.tier_ticks.resize(defs.tier_count())
	colony.tier_ticks.fill(-1)
	colony.zone_ticks.resize(defs.zone_count())
	colony.zone_ticks.fill(-1)
	colony.upgrade_levels.resize(defs.upgrades.size())
	colony.ability_ready.resize(defs.abilities.size())
	for cell: Vector2i in MapGenerator.start_cells(state.map.radius, sector, defs.sectors):
		var index: int = state.map.index_of(cell)
		state.owner[index] = colony.id
		colony.cell_count += 1
		colony.zone_ticks[state.map.zones[index] - 1] = 0
		if colony.turret < 0:
			colony.turret = index
	state.colonies.append(colony)


## Rang de chaque case dans un ordre tiré de la graine (mélange de Fisher-Yates).
func _shuffled_ranks(size: int) -> PackedInt32Array:
	var order := PackedInt32Array()
	for cell: int in range(size):
		order.append(cell)
	for i: int in range(size - 1, 0, -1):
		var j: int = state.rng.range_int(i + 1)
		var swap: int = order[i]
		order[i] = order[j]
		order[j] = swap
	var ranks := PackedInt32Array()
	ranks.resize(size)
	for position: int in range(size):
		ranks[order[position]] = position
	return ranks
