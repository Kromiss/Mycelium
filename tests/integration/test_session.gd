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


func test_commands_are_played_at_the_next_tick_for_the_local_colony() -> void:
	_session.start_local(SimDefs.from_mode(DUEL), 1, 2)
	_session.local_colony = 1
	_session.send_command(TargetCommand.new(Vector2i(-10, -1), 0))
	_session.step()
	assert_eq(_ticks[0].refused.size(), 0)
	var target: int = _session.simulation.cell_index(Vector2i(-10, -1))
	assert_eq(_session.simulation.state.colonies[1].designated, target)
	assert_eq(_session.replay.commands.size(), 1)


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
