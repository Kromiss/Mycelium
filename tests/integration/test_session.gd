extends GutTest
## Session locale : cadence des ticks, pause et vitesse réservées au Bac à sable.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")

var _session: Session
var _ticks: Array[TickResult] = []


func before_each() -> void:
	_ticks = []
	_session = Session.new()
	add_child_autofree(_session)
	_session.set_process(false)
	_session.ticked.connect(func(result: TickResult) -> void: _ticks.append(result))


func test_one_tick_per_second_of_game() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 1, 1)
	_session.advance_time(0.5)
	assert_eq(_ticks.size(), 0)
	assert_almost_eq(_session.tick_fraction(), 0.5, 0.001)
	_session.advance_time(0.6)
	assert_eq(_ticks.size(), 1)
	_session.advance_time(3.0)
	assert_eq(_ticks.size(), 4)
	assert_eq(_session.simulation.state.tick, 4)


func test_local_orders_take_effect_at_once() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 1, 2)
	_session.local_colony = 1
	var applied: Array[TickResult] = []
	_session.commands_applied.connect(func(result: TickResult) -> void: applied.append(result))
	_session.send_command(TargetCommand.new(Vector2i(-10, -1), 0))
	# Joué tout de suite, sans attendre le tick (décidé le 5 octobre 2026).
	var target: int = _session.simulation.cell_index(Vector2i(-10, -1))
	assert_eq(_session.simulation.state.colonies[1].designated, target)
	assert_eq(_session.simulation.state.tick, 0)
	assert_eq(_ticks.size(), 0)
	assert_eq(applied.size(), 1)
	assert_eq(applied[0].refused.size(), 0)
	assert_eq(_session.replay.commands.size(), 1)
	var early: bool = _session.replay.commands[0].get("early", false)
	assert_true(early)


func test_orders_between_ticks_replay_identically() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 4, 2)
	_session.add_robot(Robot.new(RobotCatalog.CONQUEROR, 1, 4))
	var colony: ColonyState = _session.colony()
	for second: int in range(150):
		if second % 3 == 0:
			_session.send_command(BuyUpgradeCommand.new(&"damage", 0))
		if second == 20:
			_session.send_command(SetPriorityCommand.new(ColonyState.Priority.RICHEST))
		if second == 130:
			_session.send_command(UseAbilityCommand.new(&"salvo"))
		_session.step()
	assert_gt(colony.upgrade_levels[0], 0)
	var hashes: PackedInt64Array = _session.replay.play()
	assert_eq(hashes[hashes.size() - 1], _session.simulation.state_hash())
	var copy: Replay = Replay.from_dict(_session.replay.to_dict())
	assert_eq(copy.play(), hashes)


func test_apply_now_plays_only_the_commands() -> void:
	var simulation := Simulation.new(SimDefs.from_mode(DUEL), 1, 1)
	simulation.tick()
	var colony: ColonyState = simulation.state.colonies[0]
	var nutrients: int = colony.nutrients
	var commands: Array[Command] = [SetPriorityCommand.new(ColonyState.Priority.HEAL_FIRST)]
	var result: TickResult = simulation.apply_now(commands)
	assert_eq(result.tick, 1)
	assert_eq(simulation.state.tick, 1)
	assert_eq(colony.priority, ColonyState.Priority.HEAL_FIRST)
	assert_eq(colony.nutrients, nutrients)
	assert_eq(result.state_hash, simulation.state_hash())


func test_pause_and_speed_only_in_sandbox() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 1, 1, false)
	_session.set_paused(true)
	_session.set_speed(4)
	assert_false(_session.paused)
	assert_eq(_session.speed, 1)
	_session.start_local(SimDefs.from_mode(DUEL), 1, 1, true)
	_session.set_paused(true)
	_session.advance_time(5.0)
	assert_eq(_ticks.size(), 0)
	_session.set_paused(false)
	_session.cycle_speed()
	assert_eq(_session.speed, 2)
	_session.advance_time(1.0)
	assert_eq(_ticks.size(), 2)
	_session.cycle_speed()
	_session.cycle_speed()
	assert_eq(_session.speed, 1)


func test_a_long_frame_does_not_freeze_the_game() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 1, 1)
	_session.advance_time(100.0)
	assert_eq(_ticks.size(), Session.MAX_TICKS_PER_FRAME)
	assert_lte(_session.tick_fraction(), 1.0)
