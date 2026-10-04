extends GutTest
## Choix des cibles de la Tourelle (GDD §5.2 à §5.4) : portée, cases collées au territoire,
## protection de départ, priorités, cible au clic, cibles gardées, une cible par spore.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


func test_a_target_must_touch_the_territory_and_be_in_range() -> void:
	var state: GameState = _sim.state
	assert_eq(Targeting.check_target(state, _colony(), _cell(Vector2i(10, 1))), Refusal.Code.OK)
	assert_eq(Targeting.check_target(state, _colony(), _cell(Vector2i(9, 0))), Refusal.Code.OK)
	assert_eq(
		Targeting.check_target(state, _colony(), _cell(Vector2i(8, 0))), Refusal.Code.NOT_ADJACENT
	)
	assert_eq(
		Targeting.check_target(state, _colony(), _cell(Fixture.TURRET_0)), Refusal.Code.TURRET_CELL
	)
	assert_eq(
		Targeting.check_target(state, _colony(), _cell(Fixture.INNER_0)), Refusal.Code.NOT_WOUNDED
	)
	Fixture.give(_sim, 0, Fixture.line_to_center(6))
	assert_eq(
		Targeting.check_target(state, _colony(), _cell(Vector2i(5, 0))), Refusal.Code.OUT_OF_RANGE
	)


func test_enemy_cells_are_protected_at_the_start() -> void:
	# La colonie 1 a une case collée à la colonie 0.
	Fixture.give(_sim, 1, [Vector2i(10, 1)])
	var enemy: int = _cell(Vector2i(10, 1))
	assert_eq(Targeting.check_target(_sim.state, _colony(), enemy), Refusal.Code.PROTECTED)
	_sim.state.tick = _sim.state.defs.protection_ticks
	assert_eq(Targeting.check_target(_sim.state, _colony(), enemy), Refusal.Code.OK)


func test_closest_priority_takes_the_nearest_cell_and_keeps_it() -> void:
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets.size(), 1)
	var first: int = _colony().targets[0]
	assert_eq(_sim.state.distance(first, _colony().turret), 1)
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets[0], first)


func test_richest_priority_prefers_cells_closer_to_the_centre() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(3))
	_colony().priority = ColonyState.Priority.RICHEST
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"range")] = 2
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_sim.state.map.zones[_colony().targets[0]], 2)
	_colony().priority = ColonyState.Priority.CLOSEST
	_colony().targets = PackedInt32Array()
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_sim.state.map.zones[_colony().targets[0]], 1)


func test_heal_first_targets_wounded_cells_only_with_that_priority() -> void:
	var inner: int = _cell(Fixture.INNER_0)
	_sim.state.hp[inner] = 1_000
	Targeting.refresh(_sim.state, _colony())
	assert_ne(_colony().targets[0], inner)
	_colony().priority = ColonyState.Priority.HEAL_FIRST
	_colony().targets = PackedInt32Array()
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets[0], inner)


func test_enemies_first_targets_enemy_cells_after_the_protection() -> void:
	Fixture.give(_sim, 1, [Vector2i(9, 2), Vector2i(10, 1)])
	_colony().priority = ColonyState.Priority.ENEMIES_FIRST
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_sim.state.owner[_colony().targets[0]], -1)
	_sim.state.tick = _sim.state.defs.protection_ticks
	_colony().targets = PackedInt32Array()
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets[0], _cell(Vector2i(10, 1)))


func test_a_kept_target_is_not_dropped_for_a_better_one() -> void:
	# Décidé le 4 octobre 2026 : la Tourelle finit sa prise avant de soigner.
	_colony().priority = ColonyState.Priority.HEAL_FIRST
	Targeting.refresh(_sim.state, _colony())
	var target: int = _colony().targets[0]
	_sim.state.hp[_cell(Fixture.INNER_0)] = 1_000
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets[0], target)


func test_clicked_target_comes_first_until_captured() -> void:
	var clicked := Vector2i(9, 0)
	var result: TickResult = _sim.tick([TargetCommand.new(clicked, 0)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().designated, _cell(clicked))
	assert_eq(result.shots[1], _cell(clicked))
	while _sim.state.owner[_cell(clicked)] != 0:
		_sim.tick()
	_sim.tick()
	assert_eq(_colony().designated, -1)


func test_each_spore_takes_a_different_target() -> void:
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"spores")] = 2
	Targeting.refresh(_sim.state, _colony())
	assert_eq(_colony().targets.size(), 3)
	var result: TickResult = _sim.tick()
	var hit := PackedInt32Array()
	for i: int in range(1, result.shots.size(), 2):
		if result.shots[i - 1] == 0:
			hit.append(result.shots[i])
	assert_eq(hit.size(), 3)
	assert_ne(hit[0], hit[1])
	assert_ne(hit[1], hit[2])


func test_untargetable_clicks_are_refused() -> void:
	var result: TickResult = _sim.tick([TargetCommand.new(Vector2i(5, 0), 0)])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.OUT_OF_RANGE]))
