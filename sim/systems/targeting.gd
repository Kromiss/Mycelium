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
## « cache » : cases visables gardées pendant les tirs du tick (null : un nouveau passage).
static func refresh(
	state: GameState, colony: ColonyState, reach: int = -1, cache: TargetCache = null
) -> void:
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
		if cache == null:
			cache = TargetCache.new(state, colony, reach)
		kept.append_array(cache.best(wanted - kept.size(), excluded))
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
	return TargetCache.new(state, colony, reach).best(count, excluded)


## Clé de tri d'une case du disque de portée (plus petite = visée d'abord), ou −1 si elle ne
## peut pas être choisie : groupe, critère, distance, puis rang tiré de la graine (unique, donc
## deux cases n'ont jamais la même clé). Mes cases blessées ne sont visées qu'en « Soigner
## d'abord » ; les autres doivent toucher mon territoire (et pas de case adverse pendant la
## protection de départ). Appelée très souvent : les tableaux de l'état sont lus directement.
static func candidate_key(state: GameState, colony: ColonyState, cell: int) -> int:
	var owners: PackedInt32Array = state.owner
	var me: int = colony.id
	var owner: int = owners[cell]
	var own: bool = owner == me
	var priority: int = colony.priority
	if own:
		if priority != ColonyState.Priority.HEAL_FIRST or cell == colony.turret:
			return -1
		if state.hp[cell] >= ColonyStats.cell_max_hp(state, cell):
			return -1
	else:
		if owner >= 0 and not state.protection_over():
			return -1
		var table: PackedInt32Array = state.map.neighbor_table
		var touches: bool = false
		for slot: int in range(cell * 6, cell * 6 + 6):
			var other: int = table[slot]
			if other >= 0 and owners[other] == me:
				touches = true
				break
		if not touches:
			return -1
	var group: int = 0
	var criterion: int = 0
	match priority:
		ColonyState.Priority.RICHEST:
			criterion = MAX_ZONES - state.map.zones[cell]
		ColonyState.Priority.HEAL_FIRST:
			group = 0 if own else 1
		ColonyState.Priority.ENEMIES_FIRST:
			group = 0 if owner >= 0 else 1
	var delta: Vector2i = state.map.cells[cell] - state.map.cells[colony.turret]
	@warning_ignore("integer_division")
	var distance: int = (absi(delta.x) + absi(delta.y) + absi(delta.x + delta.y)) / 2
	var rank: int = (group * MAX_ZONES + criterion) * MAX_DISTANCE + distance
	return rank * MAX_CELLS + state.cell_rank[cell]
