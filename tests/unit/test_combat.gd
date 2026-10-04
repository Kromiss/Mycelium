extends GutTest
## Dégâts, prises, coupures, élimination et Trophée (GDD §6, §7, §12).

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation
var _result: TickResult


func before_each() -> void:
	_sim = Fixture.duel(2, false)
	_sim.state.tick = _sim.state.defs.protection_ticks
	_result = TickResult.new()


func _colony(colony_id: int) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


func test_a_free_cell_is_captured_at_full_health() -> void:
	var cell: int = _cell(Vector2i(10, 1))
	var left: int = Combat.deal(_sim.state, _colony(0), cell, 50_000, _result)
	assert_eq(_sim.state.owner[cell], 0)
	assert_eq(_sim.state.hp[cell], _sim.cell_max_hp(cell))
	assert_eq(left, 10_000)
	assert_eq(_colony(0).cell_count, 4)
	assert_eq(_colony(0).cells_captured, 1)
	assert_eq(_result.captures, PackedInt32Array([0, cell, -1]))


func test_a_damaged_free_cell_remembers_its_attacker() -> void:
	var cell: int = _cell(Vector2i(10, 1))
	Combat.deal(_sim.state, _colony(0), cell, 15_000, _result)
	assert_eq(_sim.state.owner[cell], -1)
	assert_eq(_sim.state.hp[cell], 25_000)
	assert_eq(_sim.state.last_hitter[cell], 0)


func test_a_cell_not_touching_the_attacker_never_drops_below_one() -> void:
	var cell: int = _cell(Vector2i(7, 0))
	Combat.deal(_sim.state, _colony(0), cell, 1_000_000, _result)
	assert_eq(_sim.state.owner[cell], -1)
	assert_eq(_sim.state.hp[cell], 1)


func test_an_enemy_cell_is_captured_at_a_quarter_of_its_health() -> void:
	Fixture.give(_sim, 1, [Vector2i(10, 1)])
	var cell: int = _cell(Vector2i(10, 1))
	Combat.deal(_sim.state, _colony(0), cell, 1_000_000, _result)
	assert_eq(_sim.state.owner[cell], 0)
	assert_eq(_sim.state.hp[cell], Fixed.mul(_sim.cell_max_hp(cell), 250))
	assert_eq(_colony(1).cell_count, 3)


func test_enemy_cells_are_safe_during_the_protection() -> void:
	_sim.state.tick = 0
	Fixture.give(_sim, 1, [Vector2i(10, 1)])
	var cell: int = _cell(Vector2i(10, 1))
	var before: int = _sim.state.hp[cell]
	Combat.deal(_sim.state, _colony(0), cell, 10_000, _result)
	assert_eq(_sim.state.hp[cell], before)


func test_cells_cut_off_from_their_turret_become_free() -> void:
	# Colonie 0 : une ligne vers le centre ; la colonie 1 prend la case du milieu.
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	Fixture.give(_sim, 1, [Vector2i(8, 1)])
	var middle: int = _cell(Vector2i(9, 0))
	Combat.deal(_sim.state, _colony(1), middle, 1_000_000, _result)
	assert_eq(_sim.state.owner[middle], 1)
	for coords: Vector2i in [Vector2i(8, 0), Vector2i(7, 0)]:
		assert_eq(_sim.state.owner[_cell(coords)], -1)
	assert_eq(_colony(0).cell_count, 3)
	assert_eq(_result.cells_lost.size(), 4)


func test_a_wall_keeps_cells_from_losing_health() -> void:
	Fixture.give(_sim, 1, [Vector2i(10, 1)])
	var cell: int = _cell(Vector2i(10, 1))
	_colony(1).wall_center = cell
	_colony(1).wall_radius = 3
	_colony(1).wall_until = _sim.state.tick + 1
	var before: int = _sim.state.hp[cell]
	Combat.deal(_sim.state, _colony(0), cell, 10_000, _result)
	assert_eq(_sim.state.hp[cell], before)
	_sim.state.tick += 1
	Combat.deal(_sim.state, _colony(0), cell, 10_000, _result)
	assert_eq(_sim.state.hp[cell], before - 10_000)


func test_healing_never_goes_above_the_maximum() -> void:
	var cell: int = _cell(Fixture.INNER_0)
	_sim.state.hp[cell] = 10_000
	Combat.heal(_sim.state, cell, 5_000, _result)
	assert_eq(_sim.state.hp[cell], 15_000)
	Combat.heal(_sim.state, cell, 1_000_000, _result)
	assert_eq(_sim.state.hp[cell], _sim.cell_max_hp(cell))


func test_downing_a_turret_eliminates_the_colony_and_gives_a_trophy() -> void:
	# La Tourelle de la colonie 1 est collée au territoire de la colonie 0.
	Fixture.give(_sim, 0, [Vector2i(-10, 0)])
	var turret: int = _colony(1).turret
	var enzymes: int = _colony(0).enzymes
	Combat.deal(_sim.state, _colony(0), turret, 1_000_000_000, _result)
	assert_false(_colony(1).alive)
	assert_eq(_colony(1).killer, 0)
	assert_eq(_colony(1).cell_count, 0)
	assert_eq(_sim.state.owner[turret], -1)
	assert_eq(_sim.state.hp[turret], ColonyStats.free_max_hp(_sim.state, turret))
	assert_eq(_colony(0).trophies, 1)
	assert_eq(_colony(0).enzymes, enzymes + 100_000)
	assert_eq(_result.eliminations, PackedInt32Array([1, 0]))


func test_a_trophy_adds_a_quarter_to_production() -> void:
	var before: int = ColonyStats.colony_production(_sim.state, _colony(0))
	_colony(0).trophies = 2
	var after: int = ColonyStats.colony_production(_sim.state, _colony(0))
	assert_almost_eq(float(after) / float(before), 1.5, 0.001)


func test_a_turret_far_from_the_attacker_cannot_fall() -> void:
	var turret: int = _colony(1).turret
	Combat.deal(_sim.state, _colony(0), turret, 1_000_000_000, _result)
	assert_true(_colony(1).alive)
	assert_eq(_colony(1).turret_hp, 1)
