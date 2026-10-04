class_name RegenSystem
extends RefCounted
## Étape 3 du tick : régénération (GDD §6.1, §7.2, §7.4). Chaque case regagne une part de ses
## PV max par seconde : 2 % pour une case libre, la régénération de sa colonie pour une case
## possédée ; la Tourelle de même. Une case touchée par Toxique ou un Nuage toxique ne se
## régénère pas pendant l'effet. Les PV qui dépassent un maximum qui a baissé (Cohésion
## perdue) sont ramenés au maximum.


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
	for cell: int in range(state.cell_count()):
		var holder: int = state.owner[cell]
		if holder >= 0 and state.colonies[holder].turret == cell:
			continue
		var maximum: int = (
			ColonyStats.free_max_hp(state, cell)
			if holder < 0
			else ColonyStats.cell_max_hp(state, cell, factors[holder], cohesions[holder])
		)
		var rate: int = defs.regen_pm if holder < 0 else rates[holder]
		_regenerate(state, cell, maximum, rate, result)
	for colony: ColonyState in state.colonies:
		if colony.alive:
			_regenerate_turret(state, colony, rates[colony.id], result)


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
