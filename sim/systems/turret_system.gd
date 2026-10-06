class_name TurretSystem
extends RefCounted
## Étape 3 du tick : les Tourelles, puis les bâtiments de leur colonie, tirent (GDD §5, §5 bis,
## §6, §7.3) ; les Tourelles ne bougent pas (décidé le 5 octobre 2026). Les colonies jouent
## l'une après l'autre ; la première change à chaque tick (tick modulo nombre de colonies) pour
## qu'aucune ne soit toujours avantagée sur une case disputée.


func run(state: GameState, result: TickResult) -> void:
	var count: int = state.colonies.size()
	for offset: int in range(count):
		var colony: ColonyState = state.colonies[(state.tick + offset) % count]
		if not colony.alive:
			continue
		var stats: ShotStats = _fire(state, colony, result)
		if colony.alive:
			_fire_buildings(state, colony, stats, result)


## Tirs du tick : chaque tir envoie une spore par cible (cible désignée d'abord, puis cibles
## gardées) ; s'il y a moins de cibles que de spores, les spores en trop vont sur la première.
## Renvoie les chiffres de tir de la colonie s'ils ont été calculés (null sinon).
func _fire(state: GameState, colony: ColonyState, result: TickResult) -> ShotStats:
	colony.shot_progress += ColonyStats.rate_pm(state, colony)
	@warning_ignore("integer_division")
	var shots: int = colony.shot_progress / Fixed.ONE
	colony.shot_progress -= shots * Fixed.ONE
	var spores: int = ColonyStats.spores(state.defs, colony)
	var reach: int = ColonyStats.turret_range(state.defs, colony)
	var stats: ShotStats = ShotStats.of(state.defs, colony) if shots > 0 else null
	if shots > 0:
		result.colony_changed(colony.id)
	# Cases visables gardées pendant les tirs de ce tick (construites au premier besoin).
	var cache := TargetCache.new(state, colony, reach, result)
	for shot: int in range(shots):
		Targeting.refresh(state, colony, reach, cache)
		var cells: PackedInt32Array = Targeting.shot_targets(state, colony, reach)
		if cells.is_empty():
			return stats
		for spore: int in range(spores):
			var cell: int = cells[spore] if spore < cells.size() else cells[0]
			if Targeting.is_target(state, colony, cell, reach):
				result.shots.append_array(PackedInt32Array([colony.id, cell]))
				_hit(state, colony, stats, cell, result, Fixed.ONE, false)
	return stats


## Tirs des bâtiments actifs de la colonie (GDD §5 bis) : la cadence du Sporophore (sans la
## Salve) × la leur, ses dégâts × les leurs, ses spores par tir. Sans cible, un bâtiment garde
## un tir prêt et attend.
func _fire_buildings(
	state: GameState, colony: ColonyState, stats: ShotStats, result: TickResult
) -> void:
	var defs: SimDefs = state.defs
	var spores: int = -1
	for building: BuildingState in state.buildings:
		if building.owner != colony.id or not building.active(state.tick):
			continue
		var def: SimBuilding = defs.buildings[building.type]
		building.shot_progress += ColonyStats.building_rate_pm(defs, colony, building.type)
		@warning_ignore("integer_division")
		var shots: int = building.shot_progress / Fixed.ONE
		if shots == 0:
			continue
		if spores < 0:
			spores = ColonyStats.spores(defs, colony)
		if stats == null:
			stats = ShotStats.of(defs, colony)
		var reach: int = ColonyStats.building_reach(defs, colony, building.type)
		var siege: bool = def.kind == BuildingDef.Kind.MORTAR
		for shot: int in range(shots):
			var designated: bool = BuildingTargeting.refresh(state, colony, building, reach, spores)
			var cells: PackedInt32Array = BuildingTargeting.shot_targets(
				colony, building, designated
			)
			if cells.is_empty():
				building.shot_progress = mini(building.shot_progress, Fixed.ONE)
				break
			building.shot_progress -= Fixed.ONE
			for spore: int in range(spores):
				var cell: int = cells[spore] if spore < cells.size() else cells[0]
				if not BuildingTargeting.can_target(state, colony, building, cell, reach):
					continue
				result.building_shots.append_array(
					PackedInt32Array([colony.id, building.cell, cell])
				)
				_hit(state, colony, stats, cell, result, def.damage_pm, siege)
		result.colony_changed(colony.id)


## Une spore touche une case : soin si elle est à moi, dégâts sinon (× « damage_pm » ; critique,
## Éclaboussure sur les voisines, Rebond du reste des dégâts si la case est prise). « siege »
## (Mortier) : ni Éclaboussure ni Rebond, et la cible peut tomber loin de mon territoire.
func _hit(
	state: GameState,
	colony: ColonyState,
	stats: ShotStats,
	cell: int,
	result: TickResult,
	damage_pm: int,
	siege: bool,
) -> void:
	if state.owner[cell] == colony.id:
		Combat.heal(state, cell, stats.heal, result, stats.hp_factor, stats.cohesion_hp)
		return
	var amount: int = stats.damage_on(state, cell)
	if damage_pm != Fixed.ONE:
		amount = Fixed.mul(amount, damage_pm)
	if stats.crit_pm > 0 and state.rng.range_int(Fixed.ONE) < stats.crit_pm:
		amount = Fixed.mul(amount, stats.crit_damage_pm)
	var toxic: int = stats.toxic_ticks
	var remainder: int = Combat.deal(state, colony, cell, amount, result, toxic, siege)
	if siege:
		return
	if stats.splash_pm > 0:
		var splash: int = Fixed.mul(amount, stats.splash_pm)
		for direction: int in range(6):
			var other: int = state.map.neighbor_index(cell, direction)
			if other >= 0 and state.owner[other] != colony.id:
				Combat.deal(state, colony, other, splash, result, toxic)
	if remainder > 0 and stats.bounce > 0:
		for other: int in _bounce_cells(state, colony, cell, stats.bounce):
			Combat.deal(state, colony, other, remainder, result, toxic)


## Voisines de la case prise que le Rebond touche : celles qui ne sont pas à la colonie,
## dans l'ordre tiré de la graine.
static func _bounce_cells(
	state: GameState, colony: ColonyState, cell: int, count: int
) -> PackedInt32Array:
	var ranked: Array[Vector2i] = []
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		if other >= 0 and state.owner[other] != colony.id:
			ranked.append(Vector2i(state.cell_rank[other], other))
	ranked.sort()
	var cells := PackedInt32Array()
	for i: int in range(mini(count, ranked.size())):
		cells.append(ranked[i].y)
	return cells
