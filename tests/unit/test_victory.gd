extends GutTest
## Fin de partie et classement (GDD §3.3, décidé le 4 octobre 2026) : dernière colonie en vie,
## ou à 30:00 éliminations puis production moyenne, puis cases.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")


func test_the_game_stops_when_one_colony_is_left() -> void:
	var sim: Simulation = Fixture.duel(2)
	Combat.eliminate(sim.state, sim.state.colonies[1], sim.state.colonies[0], TickResult.new())
	var result: TickResult = sim.tick()
	assert_true(result.finished)
	assert_eq(sim.state.ranking, PackedInt32Array([0, 1]))


func test_a_lonely_sandbox_colony_plays_until_the_time_limit() -> void:
	var defs: SimDefs = Fixture.duel_defs()
	defs.match_ticks = 5
	var sim := Simulation.new(defs, 1, 1)
	for i: int in range(4):
		assert_false(sim.tick().finished)
	assert_true(sim.tick().finished)
	assert_true(sim.tick().finished)
	assert_eq(sim.state.tick, 5)


func test_at_the_time_limit_eliminations_rank_before_production() -> void:
	var defs: SimDefs = SimDefs.from_mode(FFA)
	defs.match_ticks = 1
	var sim := Simulation.new(defs, 1, 3)
	var state: GameState = sim.state
	state.colonies[0].biomass = 1_000
	state.colonies[1].biomass = 5_000
	state.colonies[1].trophies = 1
	state.colonies[2].biomass = 9_000
	sim.tick()
	assert_eq(state.ranking, PackedInt32Array([1, 2, 0]))


func test_eliminated_colonies_rank_by_survival_time() -> void:
	var sim := Simulation.new(SimDefs.from_mode(FFA), 1, 3)
	var state: GameState = sim.state
	state.colonies[2].alive = false
	state.colonies[2].eliminated_tick = 50
	state.colonies[1].alive = false
	state.colonies[1].eliminated_tick = 90
	assert_eq(VictorySystem.ranking(state), PackedInt32Array([0, 1, 2]))
