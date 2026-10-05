class_name TurretSystem
extends RefCounted
## Étape 2 du tick : les Tourelles tirent (GDD §5, §6, §7.3) ; elles ne bougent pas (décidé le
## 5 octobre 2026). Les colonies
## jouent l'une après l'autre ; la première change à chaque tick (tick modulo nombre de
## colonies) pour qu'aucune ne soit toujours avantagée sur une case disputée.


func run(state: GameState, result: TickResult) -> void:
	var count: int = state.colonies.size()
	for offset: int in range(count):
		var colony: ColonyState = state.colonies[(state.tick + offset) % count]
		if not colony.alive:
			continue
		_fire(state, colony, result)


## Tirs du tick : chaque tir envoie une spore par cible (cible désignée d'abord, puis cibles
## gardées) ; s'il y a moins de cibles que de spores, les spores en trop vont sur la première.
func _fire(state: GameState, colony: ColonyState, result: TickResult) -> void:
	colony.shot_progress += ColonyStats.rate_pm(state, colony)
	@warning_ignore("integer_division")
	var shots: int = colony.shot_progress / Fixed.ONE
	colony.shot_progress -= shots * Fixed.ONE
	var spores: int = ColonyStats.spores(state.defs, colony)
	var reach: int = ColonyStats.turret_range(state.defs, colony)
	var stats: ShotStats = ShotStats.of(state.defs, colony) if shots > 0 else null
	# Cases visables gardées pendant les tirs de ce tick (construites au premier besoin).
	var cache := TargetCache.new(state, colony, reach, result)
	for shot: int in range(shots):
		Targeting.refresh(state, colony, reach, cache)
		var cells: PackedInt32Array = Targeting.shot_targets(colony)
		if cells.is_empty():
			return
		for spore: int in range(spores):
			var cell: int = cells[spore] if spore < cells.size() else cells[0]
			if Targeting.is_target(state, colony, cell, reach):
				_hit(state, colony, stats, cell, result)
	if shots > 0:
		result.colony_changed(colony.id)


## Une spore touche une case : soin si elle est à moi, dégâts sinon (critique, Éclaboussure
## sur les voisines, Rebond du reste des dégâts si la case est prise).
func _hit(
	state: GameState, colony: ColonyState, stats: ShotStats, cell: int, result: TickResult
) -> void:
	result.shots.append_array(PackedInt32Array([colony.id, cell]))
	if state.owner[cell] == colony.id:
		Combat.heal(state, cell, stats.heal, result, stats.hp_factor, stats.cohesion_hp)
		return
	var amount: int = stats.damage_on(state, cell)
	if stats.crit_pm > 0 and state.rng.range_int(Fixed.ONE) < stats.crit_pm:
		amount = Fixed.mul(amount, stats.crit_damage_pm)
	var toxic: int = stats.toxic_ticks
	var remainder: int = Combat.deal(state, colony, cell, amount, result, toxic)
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
