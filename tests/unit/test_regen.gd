extends GutTest
## Régénération des cases et de la Tourelle (GDD §6.1, §7.2, §7.4).

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation
var _regen := RegenSystem.new()
var _result := TickResult.new()


func before_each() -> void:
	_sim = Fixture.duel(1)


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


func test_free_and_owned_cells_regain_two_percent_per_second() -> void:
	var free: int = _cell(Vector2i(10, 1))
	var inner: int = _cell(Fixture.INNER_0)
	_sim.state.hp[free] = 10_000
	_sim.state.hp[inner] = 10_000
	_regen.run(_sim.state, _result)
	assert_eq(_sim.state.hp[free], 10_800)
	assert_eq(_sim.state.hp[inner], 10_000 + Fixed.mul(_sim.cell_max_hp(inner), 20))


func test_regeneration_upgrade_and_tenacious_mutation() -> void:
	var colony: ColonyState = _sim.state.colonies[0]
	colony.upgrade_levels[_sim.state.defs.upgrade_index(&"regen")] = 3
	colony.mutations.append(_sim.state.defs.mutation_index(&"tenacious"))
	assert_eq(ColonyStats.regen_pm(_sim.state.defs, colony), 100)


func test_full_cells_forget_their_attacker() -> void:
	var free: int = _cell(Vector2i(10, 1))
	_sim.state.hp[free] = 39_900
	_sim.state.last_hitter[free] = 0
	_regen.run(_sim.state, _result)
	assert_eq(_sim.state.hp[free], 40_000)
	assert_eq(_sim.state.last_hitter[free], -1)


func test_toxic_cells_do_not_regenerate() -> void:
	var free: int = _cell(Vector2i(10, 1))
	_sim.state.hp[free] = 10_000
	_sim.state.no_regen_until[free] = 1
	_regen.run(_sim.state, _result)
	assert_eq(_sim.state.hp[free], 10_000)
	_sim.state.tick = 1
	_regen.run(_sim.state, _result)
	assert_eq(_sim.state.hp[free], 10_800)


func test_health_above_a_lowered_maximum_is_brought_down() -> void:
	var inner: int = _cell(Fixture.INNER_0)
	var before: int = _sim.state.hp[inner]
	_sim.state.owner[_cell(Fixture.EDGE_0)] = -1
	_regen.run(_sim.state, _result)
	assert_lt(_sim.state.hp[inner], before)
	assert_eq(_sim.state.hp[inner], _sim.cell_max_hp(inner))


func test_the_turret_regenerates_like_a_cell() -> void:
	var colony: ColonyState = _sim.state.colonies[0]
	colony.turret_hp = 100_000
	_regen.run(_sim.state, _result)
	assert_eq(colony.turret_hp, 108_000)
