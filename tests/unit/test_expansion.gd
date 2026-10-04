extends GutTest
## Colonisation, pousse et file d'expansion (GDD §4.4).

const DUEL: ModeDef = preload("res://data/modes/duel.tres")

## Cases de départ de la colonie 0 en Duel (rayon 11) : Cœur, vers le centre, bord.
const HEART := Vector2i(11, 0)
const INNER := Vector2i(10, 0)
const EDGE := Vector2i(11, -1)
## Cases libres collées au réseau de départ (zone 1).
const BELOW := Vector2i(10, 1)
const ABOVE := Vector2i(10, -1)
const EDGE_UP := Vector2i(11, -2)
## Case collée seulement à ABOVE (pas au réseau de départ).
const BEYOND_ABOVE := Vector2i(9, -1)
## Case collée seulement à BEYOND_ABOVE.
const FURTHER := Vector2i(8, -1)

var _sim: Simulation


func before_each() -> void:
	_sim = Simulation.new(SimDefs.from_mode(DUEL), 1, 1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _index(cell: Vector2i) -> int:
	return _sim.cell_index(cell)


func _state_of(cell: Vector2i) -> int:
	return _sim.state.cell_state[_index(cell)]


func _run(ticks: int, commands: Array[Command] = []) -> TickResult:
	var result: TickResult = _sim.tick(commands)
	for i: int in range(ticks - 1):
		result = _sim.tick()
	return result


func test_start_state() -> void:
	var colony: ColonyState = _colony()
	assert_eq(colony.cell_count, 3)
	assert_eq(colony.heart, _index(HEART))
	assert_eq(colony.nutrients, 180_000)
	assert_eq(colony.tier, 0)
	for cell: Vector2i in [HEART, INNER, EDGE]:
		assert_eq(_state_of(cell), GameState.CellState.OWNED)
		assert_eq(_sim.state.connected[_index(cell)], 1)


func test_first_cell_costs_exactly_u_then_grows_by_two_percent() -> void:
	assert_eq(_sim.colonize_cost(0, BELOW), 30_000)
	_colony().cell_count = 4
	assert_eq(_sim.colonize_cost(0, BELOW), 30_600)
	_colony().cell_count = 13
	# 30 × 1,02^10 ≈ 36,57
	assert_eq(_sim.colonize_cost(0, BELOW), 36_570)


func test_cost_follows_zone_difficulty() -> void:
	# Zone 2 commence à 9 cases du centre en Duel : ×1,4.
	assert_eq(_sim.colonize_cost(0, Vector2i(9, 0)), 42_000)
	assert_eq(_sim.colonize_cost(0, Vector2i(0, 0)), 150_000)


func test_growth_time_per_zone() -> void:
	var expected: Array[int] = [4, 5, 6, 8, 10, 12]
	for zone: int in range(1, 7):
		var distance: int = (6 - zone) * 2
		assert_eq(_sim.growth_ticks(Vector2i(distance, 0)), expected[zone - 1], "zone %d" % zone)


func test_colonize_grows_in_four_ticks_and_pays_at_start() -> void:
	var result: TickResult = _sim.tick([ColonizeCommand.new(BELOW)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_state_of(BELOW), GameState.CellState.GROWING)
	assert_eq(result.growth_started, PackedInt32Array([0, _index(BELOW)]))
	# Payé 30, puis production du tick (3 cases à 2 voisines : 3 × 3,666).
	assert_eq(_colony().nutrients, 180_000 - 30_000 + 10_998)
	_run(2)
	assert_eq(_state_of(BELOW), GameState.CellState.GROWING)
	result = _sim.tick()
	assert_eq(_state_of(BELOW), GameState.CellState.OWNED)
	assert_eq(result.growth_completed, PackedInt32Array([0, _index(BELOW)]))
	assert_eq(_colony().cell_count, 4)
	assert_eq(_sim.state.connected[_index(BELOW)], 1)


func test_refusals() -> void:
	var commands: Array[Command] = [
		ColonizeCommand.new(Vector2i(0, 0)),
		ColonizeCommand.new(INNER),
		ColonizeCommand.new(Vector2i(50, 50)),
		ColonizeCommand.new(BELOW, 3),
		ColonizeCommand.new(BELOW),
		ColonizeCommand.new(ABOVE),
	]
	var result: TickResult = _sim.tick(commands)
	assert_eq(
		result.refused_codes,
		PackedInt32Array(
			[
				Refusal.Code.NOT_ADJACENT,
				Refusal.Code.CELL_TAKEN,
				Refusal.Code.OUT_OF_MAP,
				Refusal.Code.NO_GROWTH_SLOT,
				Refusal.Code.UNKNOWN_COLONY,
			]
		)
	)
	# Les commandes refusées sont rendues triées par colonie : la colonie 3 en dernier.
	assert_eq(result.refused[4].colony_id, 3)


func test_not_enough_nutrients() -> void:
	_colony().nutrients = 29_999
	var result: TickResult = _sim.tick([ColonizeCommand.new(BELOW)])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.NOT_ENOUGH_NUTRIENTS]))


func test_growing_cell_is_not_part_of_the_network_yet() -> void:
	_sim.tick([ColonizeCommand.new(ABOVE)])
	assert_eq(_sim.check_colonize(0, BEYOND_ABOVE), Refusal.Code.NOT_ADJACENT)
	_run(3)
	assert_eq(_sim.check_colonize(0, BEYOND_ABOVE), Refusal.Code.OK)


func test_queue_runs_in_order_and_follows_chains() -> void:
	var commands: Array[Command] = [
		EnqueueCommand.new(ABOVE),
		EnqueueCommand.new(BEYOND_ABOVE),
		EnqueueCommand.new(FURTHER),
		EnqueueCommand.new(BELOW),
	]
	var result: TickResult = _sim.tick(commands)
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().growing, PackedInt32Array([_index(ABOVE)]))
	assert_eq(
		_colony().queue, PackedInt32Array([_index(BEYOND_ABOVE), _index(FURTHER), _index(BELOW)])
	)
	# ABOVE pousse en 4 ticks (0 à 3) ; BEYOND_ABOVE (zone 2 : 5 s) démarre au tick 4.
	_run(4)
	assert_eq(_state_of(ABOVE), GameState.CellState.OWNED)
	assert_eq(_colony().growing, PackedInt32Array([_index(BEYOND_ABOVE)]))
	_run(5)
	assert_eq(_colony().growing, PackedInt32Array([_index(FURTHER)]))
	_run(5)
	assert_eq(_colony().growing, PackedInt32Array([_index(BELOW)]))
	_run(4)
	assert_true(_colony().queue.is_empty())
	assert_eq(_colony().cell_count, 7)


func test_queue_holds_five_cells_growth_included() -> void:
	var cells: Array[Vector2i] = [ABOVE, BELOW, EDGE_UP, BEYOND_ABOVE, FURTHER, Vector2i(9, 1)]
	var commands: Array[Command] = []
	for cell: Vector2i in cells:
		commands.append(EnqueueCommand.new(cell))
	var result: TickResult = _sim.tick(commands)
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.QUEUE_FULL]))
	assert_eq(_colony().queue_load(), 5)


func test_queue_refusals() -> void:
	var commands: Array[Command] = [
		EnqueueCommand.new(BEYOND_ABOVE),
		EnqueueCommand.new(ABOVE),
		EnqueueCommand.new(ABOVE),
		EnqueueCommand.new(INNER),
		DequeueCommand.new(BELOW),
	]
	var result: TickResult = _sim.tick(commands)
	assert_eq(
		result.refused_codes,
		PackedInt32Array(
			[
				Refusal.Code.NOT_ADJACENT,
				Refusal.Code.ALREADY_QUEUED,
				Refusal.Code.CELL_TAKEN,
				Refusal.Code.NOT_QUEUED,
			]
		)
	)


func test_queue_waits_for_nutrients_without_skipping() -> void:
	_colony().nutrients = 0
	var commands: Array[Command] = [EnqueueCommand.new(ABOVE), EnqueueCommand.new(BELOW)]
	_sim.tick(commands)
	assert_true(_colony().growing.is_empty())
	assert_eq(_colony().queue.size(), 2)
	# Environ 11 nutriments par seconde : 30 sont réunis en 3 ticks, et la case part au 4ᵉ.
	_run(2)
	assert_true(_colony().growing.is_empty())
	_run(1)
	assert_eq(_colony().growing, PackedInt32Array([_index(ABOVE)]))
	assert_eq(_colony().queue, PackedInt32Array([_index(BELOW)]))


func test_dequeue_removes_dependent_chain() -> void:
	_colony().nutrients = 0
	var commands: Array[Command] = [
		EnqueueCommand.new(ABOVE),
		EnqueueCommand.new(BEYOND_ABOVE),
		EnqueueCommand.new(BELOW),
		EnqueueCommand.new(FURTHER),
	]
	_sim.tick(commands)
	var result: TickResult = _sim.tick([DequeueCommand.new(ABOVE)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().queue, PackedInt32Array([_index(BELOW)]))


func test_growth_already_started_cannot_be_dequeued() -> void:
	_sim.tick([EnqueueCommand.new(ABOVE), EnqueueCommand.new(BEYOND_ABOVE)])
	var result: TickResult = _sim.tick([DequeueCommand.new(ABOVE)])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.ALREADY_GROWING]))
	assert_eq(_colony().queue, PackedInt32Array([_index(BEYOND_ABOVE)]))


func test_direct_click_passes_ahead_of_a_waiting_queue() -> void:
	_colony().nutrients = 0
	_sim.tick([EnqueueCommand.new(ABOVE)])
	_colony().nutrients = 30_000
	var result: TickResult = _sim.tick([ColonizeCommand.new(BELOW)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().growing, PackedInt32Array([_index(BELOW)]))
	assert_eq(_colony().queue, PackedInt32Array([_index(ABOVE)]))


func test_direct_click_on_a_queued_cell_starts_it() -> void:
	_colony().nutrients = 0
	_sim.tick([EnqueueCommand.new(ABOVE), EnqueueCommand.new(BELOW)])
	_colony().nutrients = 30_000
	var result: TickResult = _sim.tick([ColonizeCommand.new(BELOW)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().growing, PackedInt32Array([_index(BELOW)]))
	assert_eq(_colony().queue, PackedInt32Array([_index(ABOVE)]))


func test_direct_click_counts_in_the_queue_places() -> void:
	_colony().nutrients = 0
	var commands: Array[Command] = []
	for cell: Vector2i in [ABOVE, BEYOND_ABOVE, FURTHER, BELOW, EDGE_UP]:
		commands.append(EnqueueCommand.new(cell))
	_sim.tick(commands)
	_colony().nutrients = 30_000
	var result: TickResult = _sim.tick([ColonizeCommand.new(Vector2i(9, 1))])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.QUEUE_FULL]))


func test_more_simultaneous_growths_when_allowed() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.max_growths = 2
	_sim = Simulation.new(defs, 1, 1)
	var result: TickResult = _sim.tick([ColonizeCommand.new(ABOVE), ColonizeCommand.new(BELOW)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().growing.size(), 2)
