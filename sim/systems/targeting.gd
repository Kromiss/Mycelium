class_name Targeting
extends RefCounted
## Choix des cibles de la Tourelle (GDD §5.2 à §5.4) : cases visables, priorité de tir, cible
## désignée au clic et cibles gardées jusqu'à leur prise. Partagé par les systèmes et les
## requêtes de l'interface. « reach » : portée de la Tourelle déjà calculée (−1 : la calculer).

## Bornes des parties de la clé de tri (zones, distance, nombre de cases).
const MAX_ZONES: int = 64
const MAX_DISTANCE: int = 4096
const MAX_CELLS: int = 1 << 24


## Vrai si la case est dans le cercle de portée de la Tourelle.
static func in_range(state: GameState, colony: ColonyState, cell: int, reach: int = -1) -> bool:
	if colony.turret < 0:
		return false
	if reach < 0:
		reach = ColonyStats.turret_range(state.defs, colony)
	return state.distance(colony.turret, cell) <= reach


## Raison pour laquelle la case ne peut pas être visée (OK si elle peut l'être) : une case
## libre ou adverse collée à mon territoire, ou une de mes cases blessées, à portée.
static func check_target(
	state: GameState, colony: ColonyState, cell: int, reach: int = -1
) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if cell == colony.turret:
		return Refusal.Code.TURRET_CELL
	if not in_range(state, colony, cell, reach):
		return Refusal.Code.OUT_OF_RANGE
	if state.owner[cell] == colony.id:
		if state.hp[cell] >= ColonyStats.cell_max_hp(state, cell):
			return Refusal.Code.NOT_WOUNDED
		return Refusal.Code.OK
	if not state.touches_colony(cell, colony.id):
		return Refusal.Code.NOT_ADJACENT
	if state.owner[cell] >= 0 and not state.protection_over():
		return Refusal.Code.PROTECTED
	return Refusal.Code.OK


## Vrai si la case peut être visée.
static func is_target(state: GameState, colony: ColonyState, cell: int, reach: int = -1) -> bool:
	return check_target(state, colony, cell, reach) == Refusal.Code.OK


## Remet à jour la cible désignée et les cibles gardées : celles qui ne sont plus visables
## (prises, soignées, hors de portée) sont lâchées, puis les places libres sont remplies
## dans l'ordre de la priorité. Une cible n'est jamais remplacée tant qu'elle reste visable.
static func refresh(state: GameState, colony: ColonyState, reach: int = -1) -> void:
	if reach < 0:
		reach = ColonyStats.turret_range(state.defs, colony)
	if colony.designated >= 0 and not is_target(state, colony, colony.designated, reach):
		colony.designated = -1
	var kept := PackedInt32Array()
	for cell: int in colony.targets:
		if cell == colony.designated or kept.has(cell):
			continue
		if is_target(state, colony, cell, reach):
			kept.append(cell)
	var wanted: int = ColonyStats.spores(state.defs, colony)
	if colony.designated >= 0:
		wanted -= 1
	if kept.size() < wanted:
		var excluded := kept.duplicate()
		excluded.append(colony.designated)
		kept.append_array(best_candidates(state, colony, wanted - kept.size(), excluded, reach))
	elif kept.size() > wanted:
		kept.resize(maxi(0, wanted))
	colony.targets = kept


## Cibles du prochain tir, dans l'ordre : la cible désignée, puis les cibles gardées.
static func shot_targets(colony: ColonyState) -> PackedInt32Array:
	var cells := PackedInt32Array()
	if colony.designated >= 0:
		cells.append(colony.designated)
	cells.append_array(colony.targets)
	return cells


## Les « count » meilleures cases visables selon la priorité, sans celles de « excluded ».
static func best_candidates(
	state: GameState,
	colony: ColonyState,
	count: int,
	excluded: PackedInt32Array,
	reach: int = -1,
) -> PackedInt32Array:
	if reach < 0:
		reach = ColonyStats.turret_range(state.defs, colony)
	# Les « count » meilleures clés, gardées triées (count est petit : 5 spores au plus).
	var keys := PackedInt64Array()
	var cells := PackedInt32Array()
	var heal_first: bool = colony.priority == ColonyState.Priority.HEAL_FIRST
	for cell: int in state.map.disk(colony.turret, reach):
		# Tri rapide (même résultat que _key) : mes cases ne comptent qu'en « Soigner
		# d'abord », les autres doivent toucher mon territoire.
		if state.owner[cell] == colony.id:
			if not heal_first:
				continue
		elif not state.touches_colony(cell, colony.id):
			continue
		if excluded.has(cell):
			continue
		var key: int = _key(state, colony, cell)
		if key < 0 or (keys.size() >= count and key >= keys[keys.size() - 1]):
			continue
		var position: int = keys.bsearch(key)
		keys.insert(position, key)
		cells.insert(position, cell)
		if keys.size() > count:
			keys.resize(count)
			cells.resize(count)
	return cells


## Clé de tri d'une case du disque de portée (plus petite = visée d'abord), ou −1 si la
## priorité ne la retient pas : groupe, critère, distance, puis rang tiré de la graine (unique,
## donc deux cases n'ont jamais la même clé). Mes cases blessées ne sont visées que par
## « Soigner d'abord ».
static func _key(state: GameState, colony: ColonyState, cell: int) -> int:
	var own: bool = state.owner[cell] == colony.id
	if own:
		if colony.priority != ColonyState.Priority.HEAL_FIRST or cell == colony.turret:
			return -1
		if state.hp[cell] >= ColonyStats.cell_max_hp(state, cell):
			return -1
	elif not state.touches_colony(cell, colony.id):
		return -1
	elif state.owner[cell] >= 0 and not state.protection_over():
		return -1
	var group: int = 0
	var criterion: int = 0
	match colony.priority:
		ColonyState.Priority.RICHEST:
			criterion = MAX_ZONES - state.map.zones[cell]
		ColonyState.Priority.HEAL_FIRST:
			group = 0 if own else 1
		ColonyState.Priority.ENEMIES_FIRST:
			group = 0 if state.owner[cell] >= 0 else 1
	var distance: int = state.distance(colony.turret, cell)
	var rank: int = (group * MAX_ZONES + criterion) * MAX_DISTANCE + distance
	return rank * MAX_CELLS + state.cell_rank[cell]
