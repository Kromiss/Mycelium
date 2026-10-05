class_name RegenSystem
extends RefCounted
## Étape 4 du tick : régénération (GDD §5 bis, §6.1, §7.2, §7.4). Chaque case regagne une part
## de ses PV max par seconde : 2 % pour une case libre, la régénération de sa colonie pour une
## case possédée ; la Tourelle et les bâtiments de même (un chantier monte vers ses PV max).
## Une case touchée par Toxique ou un Nuage toxique ne se régénère pas pendant l'effet. Les PV
## qui dépassent un maximum qui a baissé (Cohésion perdue) sont ramenés au maximum.


func run(state: GameState, result: TickResult) -> void:
	var defs: SimDefs = state.defs
	var factors := PackedInt64Array()
	var cohesions := PackedInt64Array()
	var rates := PackedInt64Array()
	for colony: ColonyState in state.colonies:
		factors.append(ColonyStats.cell_hp_factor(defs, colony))
		cohesions.append(
			Fixed.mul(
				defs.cohesion_hp_pm, ColonyStats.mutation_product(defs, colony, &"cohesion_pm")
			)
		)
		rates.append(ColonyStats.regen_pm(defs, colony))
	# PV de base de chaque zone, case libre et case possédée (comme ColonyStats.cell_max_hp(),
	# calculés une fois par tick).
	var free_hp := PackedInt64Array()
	var owned_hp := PackedInt64Array()
	for zone: int in range(defs.zone_count()):
		free_hp.append(Fixed.mul(defs.cell_hp, defs.zone_free_hp_pm[zone]))
		owned_hp.append(Fixed.mul(defs.cell_hp, defs.zone_defense_pm[zone]))
	var owners: PackedInt32Array = state.owner
	var zones: PackedInt32Array = state.map.zones
	for cell: int in range(state.cell_count()):
		var holder: int = owners[cell]
		var zone: int = zones[cell] - 1
		if holder < 0:
			_regenerate(state, cell, free_hp[zone], defs.regen_pm, result)
			continue
		if state.colonies[holder].turret == cell:
			continue
		var neighbors: int = state.owned_neighbors(cell, holder)
		var maximum: int = Fixed.mul(owned_hp[zone], Fixed.ONE + cohesions[holder] * neighbors)
		_regenerate(state, cell, Fixed.mul(maximum, factors[holder]), rates[holder], result)
	for colony: ColonyState in state.colonies:
		if colony.alive:
			_regenerate_turret(state, colony, rates[colony.id], result)
	Buildings.regenerate(state, rates, result)


func _regenerate(state: GameState, cell: int, maximum: int, rate: int, result: TickResult) -> void:
	var current: int = state.hp[cell]
	if current > maximum:
		state.hp[cell] = maximum
		result.cell_changed(cell)
		return
	if current == maximum or state.no_regen_until[cell] > state.tick:
		return
	state.hp[cell] = mini(maximum, current + Fixed.mul(maximum, rate))
	if state.hp[cell] >= maximum:
		state.last_hitter[cell] = -1
	result.cell_changed(cell)


func _regenerate_turret(
	state: GameState, colony: ColonyState, rate: int, result: TickResult
) -> void:
	var maximum: int = ColonyStats.turret_max_hp(state.defs, colony)
	if colony.turret_hp > maximum:
		colony.turret_hp = maximum
	elif colony.turret_hp < maximum and state.no_regen_until[colony.turret] <= state.tick:
		colony.turret_hp = mini(maximum, colony.turret_hp + Fixed.mul(maximum, rate))
	else:
		return
	result.colony_changed(colony.id)
