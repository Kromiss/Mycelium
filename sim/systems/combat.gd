class_name Combat
extends RefCounted
## Dégâts, soin, prises et éliminations (GDD §6, §7, §12). Partagé par le tir des Tourelles et
## les capacités. Une case n'est prise (ou une Tourelle abattue) que si elle touche le
## territoire de l'attaquant : sinon ses PV ne descendent pas sous 1 millième.


## Inflige « amount » millièmes de dégâts à une case qui n'est pas à l'attaquant. Renvoie le
## reste des dégâts si la case a été prise (0 sinon). Rien pendant la protection de départ
## pour une case adverse, ni sur une case protégée par un Mur de mycélium. « toxic » : secondes
## sans régénération infligées (Toxique ; −1 : les calculer).
static func deal(
	state: GameState,
	attacker: ColonyState,
	cell: int,
	amount: int,
	result: TickResult,
	toxic: int = -1,
) -> int:
	var victim: ColonyState = state.owner_of(cell)
	if victim == attacker or amount <= 0:
		return 0
	if victim != null and (not state.protection_over() or is_walled(state, victim, cell)):
		return 0
	if toxic < 0:
		toxic = ColonyStats.toxic_ticks(state.defs, attacker)
	if toxic > 0:
		state.no_regen_until[cell] = maxi(state.no_regen_until[cell], state.tick + toxic)
	var reachable: bool = state.touches_colony(cell, attacker.id)
	result.cell_changed(cell)
	if victim != null and victim.turret == cell:
		result.colony_changed(victim.id)
		var left: int = victim.turret_hp - amount
		if left <= 0 and reachable:
			eliminate(state, victim, attacker, result)
		else:
			victim.turret_hp = maxi(left, 1)
		return 0
	var before: int = state.hp[cell]
	if before - amount <= 0 and reachable:
		capture(state, cell, attacker, result)
		return amount - before
	state.hp[cell] = maxi(before - amount, 1)
	state.last_hitter[cell] = attacker.id
	return 0


## Rend « amount » millièmes de PV à une de mes cases (sans dépasser ses PV max).
static func heal(state: GameState, cell: int, amount: int, result: TickResult) -> void:
	var maximum: int = ColonyStats.cell_max_hp(state, cell)
	state.hp[cell] = mini(state.hp[cell] + amount, maximum)
	if state.hp[cell] >= maximum:
		state.last_hitter[cell] = -1
	result.cell_changed(cell)


## Vrai si un Mur de mycélium de la colonie protège la case à ce tick.
static func is_walled(state: GameState, colony: ColonyState, cell: int) -> bool:
	if state.tick >= colony.wall_until or colony.wall_center < 0:
		return false
	return state.distance(colony.wall_center, cell) <= colony.wall_radius


## La case passe à l'attaquant : à pleine vie si elle était libre, à 25 % de ses PV max si
## elle était adverse (GDD §6.2, décidé le 4 octobre 2026). L'ancien propriétaire perd les
## cases qui ne sont plus reliées à sa Tourelle.
static func capture(state: GameState, cell: int, attacker: ColonyState, result: TickResult) -> void:
	var previous: ColonyState = state.owner_of(cell)
	state.owner[cell] = attacker.id
	var maximum: int = ColonyStats.cell_max_hp(state, cell)
	state.hp[cell] = maximum if previous == null else Fixed.mul(maximum, state.defs.captured_hp_pm)
	state.last_hitter[cell] = -1
	attacker.cell_count += 1
	attacker.cells_captured += 1
	var zone: int = state.map.zones[cell] - 1
	if attacker.zone_ticks[zone] < 0:
		attacker.zone_ticks[zone] = state.tick
	result.captures.append_array(
		PackedInt32Array([attacker.id, cell, -1 if previous == null else previous.id])
	)
	result.cell_changed(cell)
	result.colony_changed(attacker.id)
	if previous != null:
		previous.cell_count -= 1
		result.colony_changed(previous.id)
		if may_split(state, cell, previous.id):
			cut_off(state, previous, result)


## Faux si retirer la case ne peut pas couper le territoire de la colonie : ses voisines à la
## colonie forment une seule suite autour d'elle (elles restent reliées entre elles).
static func may_split(state: GameState, cell: int, colony_id: int) -> bool:
	var runs: int = 0
	var previous: bool = (
		state.map.neighbor_index(cell, 5) >= 0
		and state.owner[state.map.neighbor_index(cell, 5)] == colony_id
	)
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		var owned: bool = other >= 0 and state.owner[other] == colony_id
		if owned and not previous:
			runs += 1
		previous = owned
	return runs > 1


## Les cases de la colonie qui ne sont plus reliées à sa Tourelle redeviennent libres
## (décidé le 4 octobre 2026).
static func cut_off(state: GameState, colony: ColonyState, result: TickResult) -> void:
	if colony.turret < 0:
		return
	var linked := PackedByteArray()
	linked.resize(state.cell_count())
	linked[colony.turret] = 1
	var frontier := PackedInt32Array([colony.turret])
	var next: int = 0
	while next < frontier.size():
		var cell: int = frontier[next]
		next += 1
		for direction: int in range(6):
			var other: int = state.map.neighbor_index(cell, direction)
			if other >= 0 and linked[other] == 0 and state.owner[other] == colony.id:
				linked[other] = 1
				frontier.append(other)
	for cell: int in range(state.cell_count()):
		if state.owner[cell] == colony.id and linked[cell] == 0:
			free_cell(state, cell, result)
			colony.cell_count -= 1
			result.cells_lost.append_array(PackedInt32Array([colony.id, cell]))


## La Tourelle de « victim » tombe : la colonie est éliminée, toutes ses cases redeviennent
## libres et « killer » reçoit un Trophée (GDD §3.3, §12).
static func eliminate(
	state: GameState, victim: ColonyState, killer: ColonyState, result: TickResult
) -> void:
	victim.alive = false
	victim.eliminated_tick = state.tick
	victim.killer = killer.id
	victim.turret = -1
	victim.turret_hp = 0
	victim.designated = -1
	victim.targets = PackedInt32Array()
	victim.move_to = -1
	victim.move_left = 0
	victim.production = 0
	for cell: int in range(state.cell_count()):
		if state.owner[cell] == victim.id:
			free_cell(state, cell, result)
	victim.cell_count = 0
	killer.trophies += 1
	killer.enzymes += Fixed.from_units(state.defs.trophy_enzymes)
	result.eliminations.append_array(PackedInt32Array([victim.id, killer.id]))
	result.colony_changed(victim.id)
	result.colony_changed(killer.id)


## Rend une case libre, avec les PV d'une case libre de sa zone.
static func free_cell(state: GameState, cell: int, result: TickResult) -> void:
	state.owner[cell] = -1
	state.hp[cell] = ColonyStats.free_max_hp(state, cell)
	state.last_hitter[cell] = -1
	result.cell_changed(cell)
