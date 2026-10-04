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


func test_zone_arrival_is_recorded_when_the_cell_has_grown() -> void:
	_sim.tick([ColonizeCommand.new(ABOVE)])
	_run(3)
	_sim.tick([ColonizeCommand.new(BEYOND_ABOVE)])
	assert_eq(_colony().zone_ticks[1], -1)
	_run(4)
	assert_eq(_colony().zone_ticks[1], 8)


func test_game_stops_at_the_time_limit() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.match_ticks = 5
	_sim = Simulation.new(defs, 1, 1)
	var result: TickResult
	for i: int in range(5):
		result = _sim.tick()
	assert_true(result.finished)
	assert_true(_sim.state.finished)
	var biomass: int = _colony().biomass
	var frozen: int = _sim.state_hash()
	result = _sim.tick([ColonizeCommand.new(BELOW)])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.GAME_OVER]))
	assert_eq(_colony().biomass, biomass)
	assert_eq(_sim.state.tick, 5)
	assert_eq(_sim.state_hash(), frozen)
