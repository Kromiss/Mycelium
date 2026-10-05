class_name TargetCache
extends RefCounted
## Cases visables d'une colonie, triées par priorité, gardées pendant les tirs d'un tick
## (Targeting.refresh()). Construites une fois (un passage sur le disque de portée), puis
## tenues à jour à partir des changements notés dans le TickResult (TickResult.key_changes :
## cases prises, libérées ou soignées) : seule la case changée et ses voisines peuvent changer
## de clé. Le résultat est exactement celui d'un nouveau passage sur le disque à chaque tir,
## en bien moins de calcul.
## Valable tant que la Tourelle, la portée, la priorité et la protection ne changent pas :
## c'est le cas pendant les tirs d'une colonie à un tick.

var _state: GameState
var _colony: ColonyState
var _reach: int
var _result: TickResult
var _built: bool = false
## Clés triées (plus petite = visée d'abord) et cases correspondantes.
var _keys := PackedInt64Array()
var _cells := PackedInt32Array()
## Clé de chaque case (−1 : pas visable) et appartenance au disque de portée.
var _key_of := PackedInt64Array()
var _in_disk := PackedByteArray()
## Rang du prochain changement à lire dans TickResult.key_changes.
var _read: int = 0


## « result » : résultat du tick en cours, où sont notés les changements (null : aucun suivi,
## la liste n'est valable que pour l'état actuel).
func _init(state: GameState, colony: ColonyState, reach: int, result: TickResult = null) -> void:
	_state = state
	_colony = colony
	_reach = reach
	_result = result


## Les « count » meilleures cases visables, sans celles de « excluded ».
func best(count: int, excluded: PackedInt32Array) -> PackedInt32Array:
	if not _built:
		_build()
	else:
		_sync()
	var found := PackedInt32Array()
	for cell: int in _cells:
		if found.size() >= count:
			break
		if not excluded.has(cell):
			found.append(cell)
	return found


func _build() -> void:
	_built = true
	var size: int = _state.cell_count()
	_key_of.resize(size)
	_key_of.fill(-1)
	_in_disk.resize(size)
	if _result != null:
		_read = _result.key_changes.size()
	var found := PackedInt64Array()
	for cell: int in _state.map.disk(_colony.turret, _reach):
		_in_disk[cell] = 1
		var key: int = Targeting.candidate_key(_state, _colony, cell)
		_key_of[cell] = key
		if key >= 0:
			found.append(key)
	found.sort()
	_keys = found
	_cells.resize(found.size())
	var mask: int = Targeting.MAX_CELLS - 1
	var by_rank: PackedInt32Array = _state.cell_by_rank
	for i: int in range(found.size()):
		# Le rang tiré de la graine est unique : il retrouve la case de chaque clé.
		_cells[i] = by_rank[found[i] & mask]


## Met à jour les clés des cases changées depuis la dernière lecture et de leurs voisines.
func _sync() -> void:
	if _result == null:
		return
	var changes: PackedInt32Array = _result.key_changes
	var table: PackedInt32Array = _state.map.neighbor_table
	while _read < changes.size():
		var cell: int = changes[_read]
		_read += 1
		_update(cell)
		for slot: int in range(cell * 6, cell * 6 + 6):
			var other: int = table[slot]
			if other >= 0:
				_update(other)


func _update(cell: int) -> void:
	if _in_disk[cell] == 0:
		return
	var old: int = _key_of[cell]
	var key: int = Targeting.candidate_key(_state, _colony, cell)
	if key == old:
		return
	if old >= 0:
		var index: int = _keys.bsearch(old)
		_keys.remove_at(index)
		_cells.remove_at(index)
	_key_of[cell] = key
	if key >= 0:
		var position: int = _keys.bsearch(key)
		_keys.insert(position, key)
		_cells.insert(position, cell)
