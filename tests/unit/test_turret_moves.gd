extends GutTest
## Déplacement de la Tourelle pas à pas (GDD §5.5, décidé le 4 octobre 2026) : un pas de 10 s
## vers une de mes cases voisines, sans tirer ; visée sur sa case de départ jusqu'à l'arrivée.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(1, false)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


func test_a_step_lasts_ten_seconds_without_firing() -> void:
	var origin: int = _colony().turret
	var result: TickResult = _sim.tick([MoveTurretCommand.new(Fixture.INNER_0, 0)])
	assert_eq(result.refused.size(), 0)
	assert_eq(result.shots.size(), 0)
	for i: int in range(8):
		result = _sim.tick()
		assert_eq(result.shots.size(), 0)
		assert_eq(_colony().turret, origin)
	result = _sim.tick()
	assert_eq(_colony().turret, _cell(Fixture.INNER_0))
	assert_eq(result.moves, PackedInt32Array([0, origin, _cell(Fixture.INNER_0)]))
	assert_eq(_sim.state.hp[origin], _sim.cell_max_hp(origin))
	result = _sim.tick()
	assert_gt(result.shots.size(), 0)


func test_swift_mutation_halves_the_step() -> void:
	_colony().mutations.append(_sim.state.defs.mutation_index(&"swift"))
	_sim.tick([MoveTurretCommand.new(Fixture.INNER_0, 0)])
	Fixture.run(_sim, 4)
	assert_eq(_colony().turret, _cell(Fixture.INNER_0))


func test_steps_go_to_one_of_my_neighbouring_cells_one_at_a_time() -> void:
	var state: GameState = _sim.state
	assert_eq(
		TurretSystem.check_move(state, _colony(), _cell(Vector2i(10, 1))), Refusal.Code.NOT_OWNED
	)
	Fixture.give(_sim, 0, [Vector2i(9, 0)])
	assert_eq(
		TurretSystem.check_move(state, _colony(), _cell(Vector2i(9, 0))), Refusal.Code.NOT_ADJACENT
	)
	_sim.tick([MoveTurretCommand.new(Fixture.EDGE_0, 0)])
	assert_eq(
		TurretSystem.check_move(state, _colony(), _cell(Fixture.INNER_0)),
		Refusal.Code.ALREADY_MOVING
	)


func test_a_step_is_cancelled_if_the_destination_is_lost() -> void:
	var origin: int = _colony().turret
	_sim.tick([MoveTurretCommand.new(Fixture.INNER_0, 0)])
	_sim.state.owner[_cell(Fixture.INNER_0)] = -1
	Fixture.run(_sim, 9)
	assert_eq(_colony().turret, origin)
	assert_false(_colony().is_moving())
