class_name Expansion
extends RefCounted
## Règles de colonisation et de file d'expansion (GDD §4.4), partagées par les systèmes de
## la simulation et par les requêtes de l'interface (coût affiché, case colonisable…).


## Coût de colonisation d'une case pour une colonie, en millièmes :
## U × difficulté de la zone × facteur ^ (cases poussées − cases de départ).
static func cost(state: GameState, colony: ColonyState, cell: int) -> int:
	var defs: SimDefs = state.defs
	var zone_pm: int = defs.zone_cost_pm[state.map.zones[cell] - 1]
	var extra: int = clampi(
		colony.cell_count - MapGenerator.START_CELLS, 0, defs.cost_pow_table.size() - 1
	)
	return Fixed.mul(Fixed.mul(defs.unit_cost, zone_pm), defs.cost_pow_table[extra])


## Durée de pousse d'une case, en ticks.
static func growth_ticks(state: GameState, cell: int) -> int:
	return state.defs.growth_ticks_by_zone[state.map.zones[cell] - 1]


## Peut-on lancer tout de suite la pousse de la case (clic direct) ?
static func check_colonize(state: GameState, colony: ColonyState, cell: int) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if state.cell_state[cell] != GameState.CellState.FREE:
		return Refusal.Code.CELL_TAKEN
	if not state.touches_network(cell, colony.id):
		return Refusal.Code.NOT_ADJACENT
	if colony.growing.size() >= state.defs.max_growths:
		return Refusal.Code.NO_GROWTH_SLOT
	# Le clic compte dans les places de la file ; une case déjà en file y a déjà sa place.
	var occupied: int = colony.queue_load() - (1 if colony.queue.has(cell) else 0)
	if occupied >= state.defs.expansion_queue_size:
		return Refusal.Code.QUEUE_FULL
	if colony.nutrients < cost(state, colony, cell):
		return Refusal.Code.NOT_ENOUGH_NUTRIENTS
	return Refusal.Code.OK


## Peut-on ajouter la case à la file d'expansion ? « pending » : cases déjà demandées mais
## pas encore ajoutées (commandes en route vers le prochain tick), comptées comme en file.
static func check_enqueue(
	state: GameState, colony: ColonyState, cell: int, pending := PackedInt32Array()
) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if state.cell_state[cell] != GameState.CellState.FREE:
		return Refusal.Code.CELL_TAKEN
	if colony.queue.has(cell) or pending.has(cell):
		return Refusal.Code.ALREADY_QUEUED
	if colony.queue_load() + pending.size() >= state.defs.expansion_queue_size:
		return Refusal.Code.QUEUE_FULL
	var queued: PackedInt32Array = colony.queue + pending
	if not _touches_network_or_queue(state, colony, cell, queued):
		return Refusal.Code.NOT_ADJACENT
	return Refusal.Code.OK


## Peut-on retirer la case de la file d'expansion ?
static func check_dequeue(colony: ColonyState, cell: int) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if colony.growing.has(cell):
		return Refusal.Code.ALREADY_GROWING
	if not colony.queue.has(cell):
		return Refusal.Code.NOT_QUEUED
	return Refusal.Code.OK


## Lance la pousse d'une case : paie son coût et la retire de la file si elle y était.
static func start_growth(
	state: GameState, colony: ColonyState, cell: int, result: TickResult
) -> void:
	var paid: int = cost(state, colony, cell)
	colony.nutrients -= paid
	result.growth_costs.append(paid)
	var queued: int = colony.queue.find(cell)
	if queued >= 0:
		colony.queue.remove_at(queued)
	state.owner[cell] = colony.id
	state.cell_state[cell] = GameState.CellState.GROWING
	state.growth_left[cell] = growth_ticks(state, cell)
	colony.growing.append(cell)
	result.cell_changed(cell)
	result.colony_changed(colony.id)
	result.growth_started.append_array(PackedInt32Array([colony.id, cell]))


## Retire une case de la file, puis toutes celles qui ne tiennent plus que par elle.
static func dequeue(state: GameState, colony: ColonyState, cell: int) -> void:
	colony.queue.remove_at(colony.queue.find(cell))
	prune_queue(state, colony)


## Garde dans la file, dans l'ordre, les cases encore libres qui touchent le réseau, une case
## en pousse ou une case gardée plus tôt dans la file ; retire les autres (dépendances en chaîne).
static func prune_queue(state: GameState, colony: ColonyState) -> void:
	var kept := PackedInt32Array()
	for cell: int in colony.queue:
		if state.cell_state[cell] != GameState.CellState.FREE:
			continue
		if _touches_network_or_queue(state, colony, cell, kept):
			kept.append(cell)
	colony.queue = kept


## Démarre, dans l'ordre d'ajout, les cases de la file qui peuvent pousser. La première case
## qui ne peut pas démarrer (pas encore collée au réseau, ou pas assez de nutriments) bloque
## les suivantes.
static func start_queued(state: GameState, colony: ColonyState, result: TickResult) -> void:
	prune_queue(state, colony)
	while colony.growing.size() < state.defs.max_growths and not colony.queue.is_empty():
		var head: int = colony.queue[0]
		if not state.touches_network(head, colony.id):
			return
		if colony.nutrients < cost(state, colony, head):
			return
		start_growth(state, colony, head, result)


static func _touches_network_or_queue(
	state: GameState, colony: ColonyState, cell: int, queued: PackedInt32Array
) -> bool:
	return (
		state.touches_network(cell, colony.id)
		or state.touches_any(cell, colony.growing)
		or state.touches_any(cell, queued)
	)
