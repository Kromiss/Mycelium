extends GutTest
## Production, Cohésion, paliers de colonie et biomasse (GDD §4.4, §5, §6).

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const HEART := Vector2i(11, 0)
## Production d'une case de zone 1 à deux voisines : 3,333 × 1,10.
const START_CELL_YIELD: int = 3_666

var _sim: Simulation


func before_each() -> void:
	_sim = Simulation.new(SimDefs.from_mode(DUEL), 1, 1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


## Donne à la colonie 0 toutes les cases de la liste, comme si elles avaient poussé.
func _own(cells: Array[Vector2i]) -> void:
	for cell: Vector2i in cells:
		var index: int = _sim.cell_index(cell)
		_sim.state.owner[index] = 0
		_sim.state.cell_state[index] = GameState.CellState.OWNED
		_colony().cell_count += 1
	_sim.state.recompute_network()


func test_start_colony_produces_about_eleven_per_second() -> void:
	var nutrients: int = _colony().nutrients
	_sim.tick()
	assert_eq(_colony().production, 3 * START_CELL_YIELD)
	assert_eq(_colony().nutrients, nutrients + 3 * START_CELL_YIELD)
	assert_eq(_colony().biomass, 3 * START_CELL_YIELD)


func test_biomass_accumulates_production() -> void:
	for i: int in range(10):
		_sim.tick()
	assert_eq(_colony().biomass, 10 * 3 * START_CELL_YIELD)
	assert_eq(_colony().peak_production, 3 * START_CELL_YIELD)


func test_cohesion_adds_five_percent_per_owned_neighbor() -> void:
	# Le Cœur touche ses 2 cases de départ : +10 %.
	var heart: int = _sim.cell_index(HEART)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, heart), 3_666)
	# Une case libre entourée de 6 voisines possédées : +30 %.
	var center := Vector2i(9, 1)
	_own(Hex.neighbors(center))
	var index: int = _sim.cell_index(center)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, index), Fixed.mul(3_333, 1_300))


func test_zone_richness_multiplies_production() -> void:
	# Zone 2 (×1,5), sans voisine possédée.
	var cell: int = _sim.cell_index(Vector2i(8, 0))
	assert_eq(EconomySystem.cell_production(_sim.state, 0, cell), 5_000)
	# Clairière (×4).
	cell = _sim.cell_index(Vector2i.ZERO)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, cell), 13_332)


func test_growing_cells_do_not_produce_nor_count_for_cohesion() -> void:
	_sim.tick([ColonizeCommand.new(Vector2i(10, 1))])
	assert_eq(_colony().production, 3 * START_CELL_YIELD)


func test_cells_not_linked_to_the_heart_do_not_produce() -> void:
	var lonely := Vector2i(0, 0)
	_own([lonely])
	assert_eq(_sim.state.connected[_sim.cell_index(lonely)], 0)
	_sim.tick()
	assert_eq(_colony().production, 3 * START_CELL_YIELD)


func test_tier_follows_grown_cell_count() -> void:
	var defs: SimDefs = _sim.state.defs
	var expected: Dictionary[int, int] = {
		3: 0, 4: 0, 5: 1, 9: 1, 10: 2, 19: 2, 20: 3, 40: 4, 80: 5, 159: 5, 160: 6, 300: 6
	}
	for cells: int in expected:
		assert_eq(TierSystem.tier_for(defs, cells), expected[cells], "%d cases" % cells)


func test_reaching_a_tier_doubles_production_and_is_reported() -> void:
	_own([Vector2i(10, 1)])
	var result: TickResult = _sim.tick()
	assert_eq(result.tier_changes.size(), 0)
	var before: int = _colony().production
	_own([Vector2i(10, -1)])
	result = _sim.tick()
	assert_eq(result.tier_changes, PackedInt32Array([0, 0, 1]))
	assert_eq(_colony().tier, 1)
	var raw: int = 0
	for index: int in range(_sim.state.cell_count()):
		if _sim.state.connected[index] == 1:
			raw += EconomySystem.cell_production(_sim.state, 0, index)
	assert_eq(_colony().production, 2 * raw)
	assert_gt(_colony().production, 2 * before)


func test_losing_cells_lowers_the_tier() -> void:
	_own([Vector2i(10, 1), Vector2i(10, -1)])
	_sim.tick()
	assert_eq(_colony().tier, 1)
	var cell: int = _sim.cell_index(Vector2i(10, -1))
	_sim.state.owner[cell] = -1
	_sim.state.cell_state[cell] = GameState.CellState.FREE
	_colony().cell_count -= 1
	_sim.state.recompute_network()
	var result: TickResult = _sim.tick()
	assert_eq(result.tier_changes, PackedInt32Array([0, 1, 0]))


func test_cell_production_query_includes_tier() -> void:
	_own([Vector2i(10, 1), Vector2i(10, -1)])
	_sim.tick()
	var index: int = _sim.cell_index(HEART)
	assert_eq(
		_sim.cell_production(0, HEART), 2 * EconomySystem.cell_production(_sim.state, 0, index)
	)
	assert_eq(_sim.cell_production(0, Vector2i(99, 0)), -1)
