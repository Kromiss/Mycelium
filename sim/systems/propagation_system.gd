class_name PropagationSystem
extends RefCounted
## Étape 3 du tick : propagation automatique (GDD §5 bis, décidé le 11 octobre 2026). Toute la
## bordure de chaque colonie pousse sur ses voisines ; la force totale est la somme des poussées
## des cases de bordure, ramenée au plafond de la colonie. Une part fixe va aux points chauds
## (à parts égales entre ceux qui sont posés), par la bordure tournée vers eux ; le reste va à
## toute la bordure. Chaque case de bordure partage ce qu'elle reçoit à parts égales entre ses
## voisines libres et adverses (pas les adverses pendant la protection de départ).
## Les colonies jouent l'une après l'autre, la première change à chaque tick ; les dégâts d'une
## colonie sont d'abord additionnés, puis appliqués une fois par case, dans l'ordre des cases,
## pour que le résultat ne dépende pas de l'ordre de calcul.


func run(state: GameState, result: TickResult) -> void:
	var damage := PackedInt64Array()
	damage.resize(state.cell_count())
	var count: int = state.colonies.size()
	for offset: int in range(count):
		var colony: ColonyState = state.colonies[(state.tick + offset) % count]
		if colony.alive:
			_push(state, colony, damage, result)


## Bordure de la colonie : ses cases qui touchent une case qui n'est pas à elle, et pour chacune
## les voisines qu'elle peut pousser (les cases adverses sont exclues pendant la protection : une
## case de bordure qui ne touche qu'elles perd sa part). Renvoie [bordure, débuts, cibles] :
## les cibles de la case de bordure i sont cibles[débuts[i]] à cibles[débuts[i + 1]] (exclu).
static func border(state: GameState, colony_id: int) -> Array[PackedInt32Array]:
	var owners: PackedInt32Array = state.owner
	var table: PackedInt32Array = state.map.neighbor_table
	var protected: bool = not state.protection_over()
	var borders := PackedInt32Array()
	var starts := PackedInt32Array()
	var targets := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if owners[cell] != colony_id:
			continue
		var first: int = targets.size()
		var edge: bool = false
		for slot: int in range(cell * 6, cell * 6 + 6):
			var other: int = table[slot]
			if other < 0 or owners[other] == colony_id:
				continue
			edge = true
			if not (protected and owners[other] >= 0):
				targets.append(other)
		if edge:
			borders.append(cell)
			starts.append(first)
	starts.append(targets.size())
	return [borders, starts, targets]


func _push(
	state: GameState, colony: ColonyState, damage: PackedInt64Array, result: TickResult
) -> void:
	var defs: SimDefs = state.defs
	var parts: Array[PackedInt32Array] = border(state, colony.id)
	var borders: PackedInt32Array = parts[0]
	var starts: PackedInt32Array = parts[1]
	var targets: PackedInt32Array = parts[2]
	var raw: int = borders.size() * ColonyStats.push_per_cell(defs, colony)
	var force: int = mini(raw, ColonyStats.push_cap(defs, colony))
	if colony.border_cells != borders.size() or colony.push_force != force:
		colony.border_cells = borders.size()
		colony.push_force = force
		result.colony_changed(colony.id)
	if force <= 0:
		return
	var touched := PackedInt32Array()
	var spare: int = force
	if not colony.hotspots.is_empty():
		@warning_ignore("integer_division")
		var share: int = Fixed.mul(force, defs.hotspot_share_pm) / colony.hotspots.size()
		for hotspot: int in colony.hotspots:
			if _pull(state, hotspot, share, parts, damage, touched):
				spare -= share
	@warning_ignore("integer_division")
	var per_border: int = spare / borders.size()
	for i: int in range(borders.size()):
		_spread(targets, starts[i], starts[i + 1], per_border, damage, touched)
	touched.sort()
	for cell: int in touched:
		var amount: int = damage[cell]
		damage[cell] = 0
		Combat.deal(state, colony, cell, amount, result)


## Envoie la part d'un point chaud par la bordure tournée vers lui : les cases de bordure qui
## ont une cible plus proche du point chaud qu'elles se partagent la part, et chacune la partage
## entre ces cibles-là. Renvoie faux si aucune case de bordure n'est tournée vers lui (la part
## revient alors à toute la bordure).
static func _pull(
	state: GameState,
	hotspot: int,
	share: int,
	parts: Array[PackedInt32Array],
	damage: PackedInt64Array,
	touched: PackedInt32Array,
) -> bool:
	var borders: PackedInt32Array = parts[0]
	var starts: PackedInt32Array = parts[1]
	var targets: PackedInt32Array = parts[2]
	var cells: Array[Vector2i] = state.map.cells
	var goal: Vector2i = cells[hotspot]
	# Cibles tournées vers le point chaud, à la suite, et leurs débuts par case de bordure.
	var closer := PackedInt32Array()
	var closer_starts := PackedInt32Array()
	for i: int in range(borders.size()):
		var here: int = Hex.distance(cells[borders[i]], goal)
		var first: int = closer.size()
		for slot: int in range(starts[i], starts[i + 1]):
			if Hex.distance(cells[targets[slot]], goal) < here:
				closer.append(targets[slot])
		if closer.size() > first:
			closer_starts.append(first)
	if closer_starts.is_empty():
		return false
	closer_starts.append(closer.size())
	var oriented: int = closer_starts.size() - 1
	@warning_ignore("integer_division")
	var per_border: int = share / oriented
	for i: int in range(oriented):
		_spread(closer, closer_starts[i], closer_starts[i + 1], per_border, damage, touched)
	return true


## Partage « amount » à parts égales entre cells[first] et cells[last − 1].
static func _spread(
	cells: PackedInt32Array,
	first: int,
	last: int,
	amount: int,
	damage: PackedInt64Array,
	touched: PackedInt32Array,
) -> void:
	if last <= first:
		return
	@warning_ignore("integer_division")
	var each: int = amount / (last - first)
	if each <= 0:
		return
	for slot: int in range(first, last):
		var cell: int = cells[slot]
		if damage[cell] == 0:
			touched.append(cell)
		damage[cell] += each
