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
## les coins de la forêt.
func _init(defs: SimDefs, game_seed: int, colony_count: int = -1) -> void:
	var problems: PackedStringArray = defs.validate()
	assert(problems.is_empty(), "Définitions invalides : %s" % ", ".join(problems))
	var count: int = defs.sectors if colony_count < 0 else colony_count
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
	state.cell_rank = _shuffled_ranks(size)
	for cell: int in range(size):
		state.hp[cell] = ColonyStats.free_max_hp(state, cell)
	for sector: int in range(count):
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
	_turrets.run(state, result)
	_regen.run(state, result)
	_tiers.run(state, result)
	_economy.run(state, result)
	_victory.run(state, state.tick + 1, result)
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


## Vrai si la colonie peut viser la case (prise ou soin).
func is_target(colony_id: int, cell: int) -> bool:
	var colony: ColonyState = state.colony(colony_id)
	return colony != null and colony.alive and Targeting.is_target(state, colony, cell)


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
