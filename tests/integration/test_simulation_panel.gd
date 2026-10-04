extends GutTest
## Panneau de simulations : lancement, résultats, rejeu d'une partie sur la carte.

const PANEL: PackedScene = preload("res://tools/simulation_panel/simulation_panel.tscn")
const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")

const ROBOTS_FILE: String = "user://test_simulation_robots.cfg"


func before_each() -> void:
	DirAccess.remove_absolute(ROBOTS_FILE)


func after_each() -> void:
	SceneRouter.simulation_panel_state = null
	SceneRouter.replay = null
	DirAccess.remove_absolute(ROBOTS_FILE)


func _panel() -> Control:
	var panel: Control = PANEL.instantiate()
	panel.set("robots_path", ROBOTS_FILE)
	add_child_autofree(panel)
	return panel


func test_panel_runs_a_small_batch_and_shows_results() -> void:
	var panel: Control = _panel()
	var runs: SpinBox = panel.get("_runs_spin")
	var minutes: SpinBox = panel.get("_minutes_spin")
	runs.value = 1
	minutes.value = 1
	panel.call("_on_start")
	var runner: SimRunner = panel.get("_runner")
	assert_not_null(runner)
	assert_eq(runner.series.size(), 7)
	var waited: int = 0
	while not runner.is_finished() and waited < 3000:
		OS.delay_msec(10)
		waited += 10
	panel.call("_process", 0.0)
	var table: GridContainer = panel.get("_table")
	assert_eq(table.columns, 8)
	var replay_series: OptionButton = panel.get("_replay_series")
	assert_eq(replay_series.item_count, 7)


func test_replay_plays_the_recorded_game_again() -> void:
	var result: SimRunResult = (
		SimRun
		. new(
			SimDefs.from_mode(DUEL),
			4,
			RobotSpec.make(EconomyRobot.Profile.FAST, BuilderRobot.Profile.PRODUCER, 70),
			120
		)
		. run()
	)
	SceneRouter.replay = result.replay
	var screen: Node = GAME.instantiate()
	add_child_autofree(screen)
	var session: Session = screen.get_node("%Session")
	session.set_process(false)
	assert_true(session.is_replay())
	assert_false(session.accepts_commands())
	session.set_speed(64)
	assert_eq(session.speed, 64)
	for i: int in range(130):
		session.step()
	assert_false(session.is_running())
	assert_eq(session.simulation.state_hash(), result.replay.final_hash)
	assert_eq(session.colony().cell_count, result.final_cells)


func test_robot_list_is_kept_between_sessions() -> void:
	var panel: Control = _panel()
	var robots: RobotList = panel.get("_robots")
	assert_eq(robots.specs().size(), 7)
	robots.call("_on_add")
	assert_eq(RobotList.read_file(ROBOTS_FILE).size(), 8)
	var list: Array[RobotSpec] = [
		RobotSpec.make(EconomyRobot.Profile.FAST, BuilderRobot.Profile.RANDOM, 40)
	]
	RobotList.write_file(ROBOTS_FILE, list)
	var again: Control = _panel()
	var saved: RobotList = again.get("_robots")
	assert_eq(saved.specs().size(), 1)
	assert_eq(saved.specs()[0].to_dict(), list[0].to_dict())
	# La part d'expansion des robots peut être balayée.
	var sweep: OptionButton = again.get("_sweep_option")
	assert_eq(sweep.get_item_text(sweep.item_count - 1), tr("SIM_ROBOT_SHARE"))
