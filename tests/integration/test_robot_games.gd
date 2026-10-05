extends GutTest
## Parties de robots (GDD §2.5) : leurs commandes sont toutes acceptées, une partie de robots
## se rejoue à l'identique (même graine), et la Session les fait jouer avant chaque tick.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
## Assez de ticks pour dépasser la protection de départ et voir les premiers affrontements.
const TICKS: int = 360


## Joue une partie de Duel Canonnier contre Conquérant ; renvoie l'enregistrement.
func _robot_game(game_seed: int) -> Replay:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var replay := Replay.new(defs, game_seed, 2)
	var sim: Simulation = replay.create_simulation()
	var robots: Array[Robot] = [
		Robot.new(RobotCatalog.GUNNER, 0, game_seed),
		Robot.new(RobotCatalog.CONQUEROR, 1, game_seed)
	]
	while sim.state.tick < TICKS and not sim.state.finished:
		var commands: Array[Command] = []
		for robot: Robot in robots:
			commands.append_array(robot.decide(sim))
		var result: TickResult = sim.tick(commands)
		replay.record_tick(commands, result)
		assert_eq(result.refused.size(), 0, "commande refusée au tick %d" % result.tick)
	return replay


func test_robot_games_are_accepted_and_replay_identically() -> void:
	var first: Replay = _robot_game(5)
	var second: Replay = _robot_game(5)
	assert_gt(first.commands.size(), 0)
	assert_eq(first.final_hash, second.final_hash)
	assert_eq(first.commands, second.commands)
	var hashes: PackedInt64Array = first.play()
	assert_eq(hashes[hashes.size() - 1], first.final_hash)
	var kinds: Dictionary[int, bool] = {}
	for data: Dictionary in first.commands:
		kinds[DictRead.get_int(data, "type", -1)] = true
	assert_true(kinds.has(Command.Type.BUY_UPGRADE))
	assert_true(kinds.has(Command.Type.CHOOSE_MUTATION))
	assert_true(kinds.has(Command.Type.SET_PRIORITY))


func test_session_plays_robots_on_their_sectors() -> void:
	var session := Session.new()
	add_child_autofree(session)
	session.set_process(false)
	var defs: SimDefs = SimDefs.from_mode(preload("res://data/modes/ffa.tres"))
	session.start_local(defs, 3, -1, true, PackedInt32Array([0, 2, 5]))
	session.add_robot(Robot.new(RobotCatalog.BUILDER, 1, 3))
	session.add_robot(Robot.new(RobotCatalog.CONQUEROR, 2, 3))
	var state: GameState = session.simulation.state
	assert_eq(state.colonies.size(), 3)
	assert_eq(state.colonies[1].sector, 2)
	assert_eq(state.colonies[2].sector, 5)
	for i: int in range(5):
		session.step()
	var colonies: Dictionary[int, bool] = {}
	for data: Dictionary in session.replay.commands:
		colonies[DictRead.get_int(data, "colony", -1)] = true
	assert_eq(colonies.keys(), [1, 2])
	assert_eq(session.replay.sectors, PackedInt32Array([0, 2, 5]))
	assert_eq(session.replay.play()[4], session.simulation.state_hash())


func test_replay_session_refuses_orders_and_offers_fast_speeds() -> void:
	var recording: Replay = _robot_game(9)
	var session := Session.new()
	add_child_autofree(session)
	session.set_process(false)
	session.start_replay(recording)
	assert_true(session.is_spectator())
	assert_false(session.accepts_commands())
	assert_eq(session.speeds(), Session.SPECTATOR_SPEEDS)
	session.set_speed(64)
	assert_eq(session.speed, 64)
	session.advance_time(1.0)
	assert_eq(session.simulation.state.tick, 64)
	var hashes: PackedInt64Array = recording.play()
	assert_eq(session.simulation.state_hash(), hashes[63])
