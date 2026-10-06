extends GutTest
## Bâtiments (GDD §5 bis) : chute, sommeil, réveil, îlots et élimination.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation
var _result: TickResult


func before_each() -> void:
	_sim = Fixture.duel(2, false)
	_sim.state.tick = _sim.state.defs.protection_ticks
	# Le Sporophore ne vise rien : seuls les bâtiments tirent (sa cadence reste celle des bâtiments).
	_sim.state.defs.turret_range = 0
	_result = TickResult.new()


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


func _type(id: StringName) -> int:
	return _sim.state.defs.building_index(id)


## Pose un bâtiment de la colonie (palier et Enzymes fournis) ; « ready » : chantier fini.
func _build(id: StringName, coords: Vector2i, colony_id: int = 0, ready := true) -> BuildingState:
	var colony: ColonyState = _colony(colony_id)
	colony.tier = maxi(colony.tier, 6)
	colony.enzymes += Fixed.from_units(1000)
	var cell: int = _cell(coords)
	assert_eq(Buildings.check_build(_sim.state, colony, _type(id), cell), Refusal.Code.OK)
	Buildings.build(_sim.state, colony, _type(id), cell, _result)
	var building: BuildingState = _sim.state.building_on(cell)
	if ready:
		building.ready_tick = _sim.state.tick
		building.hp = _sim.building_max_hp(building)
	return building


## Donne à la colonie 1 la case (9, 0), reliée à son Sporophore posé en (8, 0).
func _enemy_next_door() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 0), Vector2i(8, 0)])
	_colony(1).turret = _cell(Vector2i(8, 0))


func test_a_building_takes_the_hits_for_its_cell_then_sleeps() -> void:
	_enemy_next_door()
	var cell: int = _cell(Vector2i(9, 0))
	var building: BuildingState = _build(&"swarmer", Vector2i(9, 0), 1)
	var cell_hp: int = _sim.state.hp[cell]
	Combat.deal(_sim.state, _colony(), cell, 50_000, _result)
	assert_eq(building.hp, _sim.building_max_hp(building) - 50_000)
	assert_eq(_sim.state.hp[cell], cell_hp)
	assert_eq(_sim.state.owner[cell], 1)
	Combat.deal(_sim.state, _colony(), cell, 1_000_000, _result)
	assert_true(building.asleep(_sim.state.tick))
	assert_eq(_sim.state.owner[cell], 1)
	assert_eq(_sim.building_slots(1)[0], 0)
	# Endormi : on se bat pour la case dessous.
	Combat.deal(_sim.state, _colony(), cell, 1_000_000, _result)
	assert_eq(_sim.state.owner[cell], 0)
	assert_eq(building.hp, 0)


func test_a_fallen_building_wakes_for_the_colony_holding_its_cell() -> void:
	_enemy_next_door()
	var cell: int = _cell(Vector2i(9, 0))
	var building: BuildingState = _build(&"swarmer", Vector2i(9, 0), 1)
	Combat.deal(_sim.state, _colony(), cell, 1_000_000, _result)
	Combat.deal(_sim.state, _colony(), cell, 1_000_000, _result)
	assert_eq(_sim.state.owner[cell], 0)
	_sim.state.tick = building.asleep_until - 1
	Buildings.update(_sim.state, _result)
	assert_true(building.asleep(_sim.state.tick))
	_sim.state.tick = building.asleep_until
	Buildings.update(_sim.state, _result)
	assert_eq(building.owner, 0)
	assert_true(building.active(_sim.state.tick))
	assert_eq(building.hp, _sim.building_max_hp(building))
	# Gardé même sans place libre.
	_colony().tier = 0
	assert_eq(Buildings.of_colony(_sim.state, 0), [building])


func test_a_fallen_building_on_a_free_cell_vanishes() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 0)])
	var cell: int = _cell(Vector2i(9, 0))
	var building: BuildingState = _build(&"swarmer", Vector2i(9, 0), 1)
	Buildings.fall(_sim.state, building, 0, _result, false)
	Combat.free_cell(_sim.state, cell, _result)
	_sim.state.tick = building.asleep_until
	Buildings.update(_sim.state, _result)
	assert_null(_sim.state.building_on(cell))
	assert_eq(_sim.state.buildings.size(), 0)
	assert_eq(_sim.state.building_at[cell], -1)


func test_a_building_holds_its_island_until_it_falls() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	var building: BuildingState = _build(&"swarmer", Vector2i(7, 0))
	Combat.capture(_sim.state, _cell(Vector2i(9, 0)), _colony(1), _result)
	assert_eq(_sim.state.owner[_cell(Vector2i(8, 0))], 0)
	assert_eq(_sim.state.owner[_cell(Vector2i(7, 0))], 0)
	Buildings.fall(_sim.state, building, 1, _result, true)
	assert_eq(_sim.state.owner[_cell(Vector2i(8, 0))], -1)
	assert_eq(_sim.state.owner[_cell(Vector2i(7, 0))], -1)


func test_an_isolated_building_grows_its_island() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	_build(&"swarmer", Vector2i(7, 0))
	Combat.capture(_sim.state, _cell(Vector2i(9, 0)), _colony(1), _result)
	var before: int = _colony().cell_count
	Fixture.run(_sim, 30)
	assert_gt(_colony().cell_count, before)
	assert_eq(_sim.state.owner[_cell(Vector2i(7, 0))], 0)


func test_an_eliminated_colony_leaves_sleeping_buildings() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 0), Vector2i(8, 0)])
	var kept: BuildingState = _build(&"swarmer", Vector2i(9, 0), 1)
	var lost: BuildingState = _build(&"outpost", Vector2i(8, 0), 1)
	Combat.eliminate(_sim.state, _colony(1), _colony(), _result)
	assert_true(kept.asleep(_sim.state.tick))
	assert_true(lost.asleep(_sim.state.tick))
	Combat.capture(_sim.state, _cell(Vector2i(9, 0)), _colony(), _result)
	_sim.state.tick = kept.asleep_until
	Buildings.update(_sim.state, _result)
	assert_eq(kept.owner, 0)
	assert_eq(_sim.state.buildings, [kept])
