extends GutTest
## Bâtiments (GDD §5 bis) : pose, places, chantier, tirs de chaque type, PV, chute, sommeil,
## réveil, îlots, démolition, élimination et Hyphes longues.

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


func _build_command(id: StringName, coords: Vector2i) -> BuildCommand:
	return BuildCommand.new(id, coords, 0)


func test_building_needs_its_tier_a_free_slot_enzymes_and_one_of_my_cells() -> void:
	var colony: ColonyState = _colony()
	var swarmer: int = _type(&"swarmer")
	var inner: int = _cell(Fixture.INNER_0)
	assert_eq(Buildings.check_build(_sim.state, colony, swarmer, inner), Refusal.Code.TIER_LOCKED)
	colony.tier = 1
	assert_eq(
		Buildings.check_build(_sim.state, colony, swarmer, inner), Refusal.Code.NOT_ENOUGH_ENZYMES
	)
	colony.enzymes = Fixed.from_units(100)
	assert_eq(
		Buildings.check_build(_sim.state, colony, _type(&"outpost"), inner),
		Refusal.Code.TIER_LOCKED
	)
	assert_eq(
		Buildings.check_build(_sim.state, colony, swarmer, _cell(Fixture.TURRET_0)),
		Refusal.Code.TURRET_CELL
	)
	assert_eq(
		Buildings.check_build(_sim.state, colony, swarmer, _cell(Vector2i(9, 0))),
		Refusal.Code.NOT_OWNED
	)
	assert_eq(Buildings.check_build(_sim.state, colony, -1, inner), Refusal.Code.UNKNOWN_BUILDING)
	assert_eq(Buildings.check_build(_sim.state, colony, swarmer, inner), Refusal.Code.OK)
	Buildings.build(_sim.state, colony, swarmer, inner, _result)
	# Palier 1 : une seule place.
	assert_eq(
		Buildings.check_build(_sim.state, colony, swarmer, _cell(Fixture.EDGE_0)),
		Refusal.Code.NO_BUILDING_SLOT
	)
	colony.tier = 2
	assert_eq(Buildings.check_build(_sim.state, colony, swarmer, inner), Refusal.Code.CELL_OCCUPIED)
	assert_eq(
		Buildings.check_build(_sim.state, colony, swarmer, _cell(Fixture.EDGE_0)), Refusal.Code.OK
	)
	assert_eq(_sim.building_slots(0), PackedInt32Array([1, 2]))


func test_a_building_is_paid_then_built_up_before_it_fires() -> void:
	var colony: ColonyState = _colony()
	colony.tier = 1
	colony.enzymes = Fixed.from_units(10)
	var start: int = _sim.state.tick
	var result: TickResult = Fixture.run(_sim, 5, [_build_command(&"swarmer", Fixture.INNER_0)])
	assert_eq(colony.enzymes, 0)
	var building: BuildingState = _sim.state.building_on(_cell(Fixture.INNER_0))
	assert_not_null(building)
	assert_eq(building.ready_tick, start + 5)
	assert_eq(result.building_shots.size(), 0)
	# PV : 10 % au début, au maximum à la fin du chantier.
	assert_eq(building.hp, _sim.building_max_hp(building))
	result = _sim.tick()
	assert_true(building.active(_sim.state.tick))
	assert_eq(
		Array(result.building_events.slice(0, 3)),
		[TickResult.BuildingEvent.COMPLETED, _cell(Fixture.INNER_0), 0]
	)
	assert_gt(result.building_shots.size(), 0)


func test_a_building_site_starts_at_a_tenth_of_its_health() -> void:
	var building: BuildingState = _build(&"swarmer", Fixture.INNER_0, 0, false)
	var maximum: int = _sim.building_max_hp(building)
	assert_eq(building.hp, Fixed.mul(maximum, 100))
	assert_true(building.building_up(_sim.state.tick))
	Fixture.run(_sim, 2)
	assert_gt(building.hp, Fixed.mul(maximum, 100))
	assert_lt(building.hp, maximum)


func test_the_swarmer_takes_free_cells_only() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 0)])
	var enemy: int = _cell(Vector2i(9, 0))
	var enemy_hp: int = _sim.state.hp[enemy]
	_build(&"swarmer", Fixture.INNER_0)
	var before: int = _colony().cell_count
	for i: int in range(60):
		var result: TickResult = _sim.tick()
		for shot: int in range(0, result.building_shots.size(), 3):
			assert_eq(result.building_shots[shot + 1], _cell(Fixture.INNER_0))
	assert_eq(_sim.state.owner[enemy], 1)
	assert_eq(_sim.state.hp[enemy], enemy_hp)
	assert_gt(_colony().cell_count, before)


func test_the_outpost_attacks_enemy_cells_beyond_the_sporophore_range() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(6))
	Fixture.give(_sim, 1, [Vector2i(5, 0)])
	var enemy: int = _cell(Vector2i(5, 0))
	var target := TargetCommand.new(Vector2i(5, 0), 0)
	assert_eq(_sim.check(target), Refusal.Code.OUT_OF_RANGE)
	_build(&"outpost", Vector2i(6, 0))
	assert_eq(_sim.check(target), Refusal.Code.OK)
	_sim.tick([target])
	assert_eq(_colony().designated, enemy)
	var captured: bool = false
	for i: int in range(120):
		_sim.tick()
		if _sim.state.owner[enemy] == 0:
			captured = true
			break
	assert_true(captured)


func test_the_outpost_leaves_free_cells_alone() -> void:
	var outpost: BuildingState = _build(&"outpost", Fixture.INNER_0)
	var result: TickResult = Fixture.run(_sim, 20)
	assert_eq(result.building_shots.size(), 0)
	assert_eq(outpost.shot_progress, Fixed.ONE)
	for cell: int in range(_sim.state.cell_count()):
		if _sim.state.owner[cell] < 0:
			assert_eq(_sim.state.hp[cell], _sim.cell_max_hp(cell))


func test_the_mortar_hits_only_buildings_and_sporophores_and_waits_without_target() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 0)])
	var plain: int = _cell(Vector2i(9, 0))
	var plain_hp: int = _sim.state.hp[plain]
	var mortar: BuildingState = _build(&"mortar", Fixture.INNER_0)
	Fixture.run(_sim, 30)
	assert_eq(_sim.state.hp[plain], plain_hp)
	assert_eq(mortar.shot_progress, Fixed.ONE)


func test_the_mortar_fells_a_far_building() -> void:
	# Une case de la colonie 1 loin du territoire de la colonie 0, à portée du Mortier (5).
	Fixture.give(_sim, 1, [Vector2i(6, 0)])
	var enemy: BuildingState = _build(&"swarmer", Vector2i(6, 0), 1)
	_build(&"mortar", Fixture.INNER_0)
	var fell: bool = false
	for i: int in range(40):
		var result: TickResult = _sim.tick()
		if enemy.asleep(_sim.state.tick):
			fell = true
			assert_eq(result.building_events[0], TickResult.BuildingEvent.FELL)
			break
	assert_true(fell)
	# Le Mortier ne prend pas de case ; l'îlot tenu par le bâtiment tombé est perdu.
	assert_ne(_sim.state.owner[_cell(Vector2i(6, 0))], 0)


func test_the_mortar_can_fell_a_far_sporophore() -> void:
	Fixture.give(_sim, 1, [Vector2i(6, 0)])
	_colony(1).turret = _cell(Vector2i(6, 0))
	_colony(1).turret_hp = 50_000
	_build(&"mortar", Fixture.INNER_0)
	Fixture.run(_sim, 12)
	assert_false(_colony(1).alive)
	assert_eq(_colony(1).killer, 0)
	assert_eq(_colony().trophies, 1)


func test_demolishing_returns_the_slot_without_refund() -> void:
	_build(&"swarmer", Fixture.INNER_0)
	_colony().tier = 1
	_colony().enzymes = 0
	var demolish := DemolishCommand.new(Fixture.INNER_0, 0)
	assert_eq(_sim.check(DemolishCommand.new(Fixture.EDGE_0, 0)), Refusal.Code.NO_BUILDING)
	assert_eq(_sim.check(demolish), Refusal.Code.OK)
	var result: TickResult = _sim.apply_now([demolish])
	assert_eq(result.refused.size(), 0)
	assert_null(_sim.state.building_on(_cell(Fixture.INNER_0)))
	assert_eq(_colony().enzymes, 0)
	assert_eq(_sim.building_slots(0), PackedInt32Array([0, 1]))


func test_long_hyphae_extend_the_buildings_not_the_sporophore() -> void:
	var building: BuildingState = _build(&"swarmer", Fixture.INNER_0)
	var reach: int = _sim.building_reach(building)
	var turret: int = ColonyStats.turret_range(_sim.state.defs, _colony())
	_colony().mutations.append(_sim.state.defs.mutation_index(&"long_hyphae"))
	assert_eq(_sim.building_reach(building), reach + 1)
	assert_eq(ColonyStats.turret_range(_sim.state.defs, _colony()), turret)


func test_the_sporophore_cannot_heal_a_building() -> void:
	_sim.state.defs.turret_range = 3
	_build(&"swarmer", Fixture.INNER_0)
	var cell: int = _cell(Fixture.INNER_0)
	_sim.state.hp[cell] = 1000
	assert_eq(Targeting.check_target(_sim.state, _colony(), cell), Refusal.Code.BUILDING_CELL)
	_colony().priority = ColonyState.Priority.HEAL_FIRST
	assert_eq(Targeting.candidate_key(_sim.state, _colony(), cell), -1)


func test_buildings_follow_the_shot_upgrades_and_their_multiplier() -> void:
	var damage: int = _sim.state.defs.upgrade_index(&"damage")
	_colony().upgrade_levels[damage] = 4
	var building: BuildingState = _build(&"swarmer", Fixture.INNER_0)
	var result: TickResult = _sim.tick()
	assert_eq(result.building_shots.size(), 3)
	var target: int = result.building_shots[2]
	# Dégâts du Sporophore (10) × (1 + 4 × 25 %) × 1 (Essaimeur).
	assert_eq(_sim.state.hp[target], _sim.cell_max_hp(target) - 20_000)
	assert_eq(building.targets, PackedInt32Array([target]))


func test_buildings_survive_a_replay() -> void:
	var colony: ColonyState = _colony()
	colony.tier = 1
	colony.enzymes = Fixed.from_units(10)
	var command := _build_command(&"swarmer", Fixture.INNER_0)
	var data: Dictionary = command.to_dict()
	var copy: Command = Command.from_dict(data)
	assert_true(copy is BuildCommand)
	assert_eq((copy as BuildCommand).building, &"swarmer")
	assert_eq((copy as BuildCommand).cell, Fixture.INNER_0)
	var demolish: Command = Command.from_dict(DemolishCommand.new(Fixture.EDGE_0, 1).to_dict())
	assert_true(demolish is DemolishCommand)
	assert_eq(demolish.colony_id, 1)
