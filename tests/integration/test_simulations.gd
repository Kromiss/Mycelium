extends GutTest
## Panneau de simulations (GDD §18.5) : parties de robots mesurées par secteur, lots simples
## et balayages, tableaux, CSV, compositions gardées, et partie regardée sur la carte.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
const PANEL: PackedScene = preload("res://tools/simulation_panel/simulation_panel.tscn")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")
const COMPOSITIONS_PATH: String = "user://test_simulation_compositions.cfg"
## Durée courte : assez pour passer la protection de départ.
const TICKS: int = 180

var _locale: String


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(COMPOSITIONS_PATH))


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.simulation_panel_state = null
	SceneRouter.sandbox_config = null
	DirAccess.remove_absolute(ProjectSettings.globalize_path(COMPOSITIONS_PATH))


func _duel(first: StringName, second: StringName) -> Array[StringName]:
	var profiles: Array[StringName] = [first, second]
	return profiles


func test_a_run_measures_each_sector_and_is_deterministic() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var first: SimRunResult = SimRun.new(defs, 4, _duel(&"gunner", &"conqueror"), TICKS).run()
	var second: SimRunResult = SimRun.new(defs, 4, _duel(&"gunner", &"conqueror"), TICKS).run()
	assert_eq(first.colonies.size(), 2)
	assert_eq(first.colonies[1].sector, 1)
	assert_eq(first.colonies[1].profile, &"conqueror")
	assert_eq(first.colonies[0].production_per_minute.size(), 3)
	assert_eq(first.colonies[0].cells_per_minute.size(), 3)
	assert_almost_eq(first.end_minute, 3.0, 0.001)
	var ranks: Array[int] = [first.colonies[0].rank, first.colonies[1].rank]
	ranks.sort()
	assert_eq(ranks, [1, 2] as Array[int])
	assert_eq(first.colonies[0].tier_minutes.size(), 6)
	assert_gt(first.colonies[0].upgrade_levels[0] + first.colonies[0].upgrade_levels[1], 0)
	for index: int in range(2):
		assert_eq(first.colonies[index].final_cells, second.colonies[index].final_cells)
		assert_eq(first.colonies[index].biomass, second.colonies[index].biomass)
		assert_eq(first.colonies[index].upgrade_levels, second.colonies[index].upgrade_levels)


func test_empty_sectors_have_no_colony() -> void:
	var defs: SimDefs = SimDefs.from_mode(FFA)
	var profiles: Array[StringName] = [&"", &"builder", &"", &"", &"gunner", &""]
	var result: SimRunResult = SimRun.new(defs, 2, profiles, 60).run()
	assert_eq(result.colonies.size(), 2)
	assert_eq(result.colonies[0].sector, 1)
	assert_eq(result.colonies[1].sector, 4)


func test_runner_plays_each_composition_and_sweep_value() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var params: Array[SandboxParam] = SandboxParam.all(defs)
	var sweep: SandboxParam = params[0]
	var runner := SimRunner.new()
	var compositions: Array[Array] = [[&"gunner", &"builder"], [&"", &""], [&"conqueror", &""]]
	runner.setup(defs, compositions, 2, 10, 60, sweep, 20.0, 30.0, 10.0)
	# La composition vide est ignorée : 2 valeurs × 2 compositions.
	assert_eq(runner.series.size(), 4)
	assert_eq(runner.job_count(), 8)
	assert_eq(runner.series[0].defs.unit_cost, 20_000)
	assert_eq(runner.series[3].defs.unit_cost, 30_000)
	assert_eq(runner.series[1].sectors(), PackedInt32Array([0]))
	assert_eq(runner.series[0].label(), "Gunner · Builder · 20")
	assert_eq(runner.series[0].sector_label(1), "S2 · Builder")
	runner.run_all()
	assert_true(runner.is_finished())
	assert_eq(runner.series[2].results[1].game_seed, 11)
	assert_eq(SimRunner.sweep_values(1.0, 2.0, 0.5), PackedFloat64Array([1.0, 1.5, 2.0]))


func test_report_rows_and_csv() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var runner := SimRunner.new()
	runner.setup(defs, [[&"gunner", &"conqueror"]] as Array[Array], 2, 3, TICKS)
	runner.run_all()
	var one: SimRunner.Series = runner.series[0]
	var game: Array[SimReport.Row] = SimReport.game_rows(one)
	assert_eq(game.size(), 4)
	assert_eq(game[0].label, "Eliminations")
	assert_eq(game[3].stats[0].mean, 3.0)
	var rows: Array[SimReport.Row] = SimReport.colony_rows(one, false)
	assert_eq(rows[0].label, "Wins (%)")
	assert_eq(rows[0].stats.size(), 2)
	assert_almost_eq(rows[0].stats[0].mean + rows[0].stats[1].mean, 100.0, 0.001)
	var labels: Array[String] = []
	for row: SimReport.Row in rows:
		labels.append(row.label)
	assert_has(labels, "Arrival in zone 2 (min)")
	assert_has(labels, "Tier 6 reached (min)")
	assert_has(labels, "Level: Damage")
	assert_eq(SimReport.mean_curve(one, 1, SimReport.CurveKind.CELLS).size(), 3)
	var csv: String = SimReport.to_csv(runner.series)
	var lines: PackedStringArray = csv.strip_edges().split("\n")
	assert_eq(lines[0], "Series,Sector,Robot,Measure,mean,min,max,std dev,games")
	assert_string_contains(csv, "Gunner · Conqueror,,,Eliminations,")
	assert_string_contains(csv, "Gunner · Conqueror,2,Conqueror,Wins (%),")
	assert_string_contains(csv, "Gunner · Conqueror,1,Gunner,Cells at minute 3,")
	assert_eq(lines.size(), 1 + 4 + 2 * SimReport.colony_rows(one, true).size())


func test_compositions_follow_the_forest_and_are_kept() -> void:
	var list := CompositionList.new()
	list.load_lists(COMPOSITIONS_PATH)
	add_child_autofree(list)
	list.set_forest(&"duel", 2)
	assert_eq(list.compositions().size(), 3)
	assert_eq(list.compositions()[0], [&"gunner", &"builder"] as Array[StringName])
	list.set_forest(&"ffa", 6)
	assert_eq(list.compositions().size(), 1)
	assert_eq(list.compositions()[0].size(), 6)
	list.call("_on_add")
	var again := CompositionList.new()
	again.load_lists(COMPOSITIONS_PATH)
	add_child_autofree(again)
	again.set_forest(&"ffa", 6)
	assert_eq(again.compositions().size(), 2)
	again.set_forest(&"duel", 2)
	assert_eq(again.compositions().size(), 3)


func test_panel_runs_shows_results_and_opens_a_robot_game() -> void:
	var panel: Control = PANEL.instantiate()
	panel.set("compositions_path", COMPOSITIONS_PATH)
	add_child_autofree(panel)
	panel.set_process(false)
	var runs: SpinBox = panel.get("_runs_spin")
	var minutes: SpinBox = panel.get("_minutes_spin")
	var list: CompositionList = panel.get("_compositions")
	runs.value = 1
	minutes.value = 1
	list.call("_remove", list.compositions()[2])
	list.call("_remove", list.compositions()[1])
	panel.call("start", false)
	var running: bool = panel.call("is_running")
	assert_false(running)
	var runner: SimRunner = panel.call("runner")
	assert_eq(runner.series.size(), 1)
	assert_eq(runner.duration_ticks, 60)
	var tables: VBoxContainer = panel.get("_tables")
	assert_eq(tables.get_child_count(), 1)
	var config: SandboxConfig = panel.call("watch_config", 0, 0)
	assert_true(config.spectator)
	assert_eq(config.profiles, [&"gunner", &"builder"] as Array[StringName])
	assert_eq(config.defs.match_ticks, 60)
	assert_eq(config.colony_profiles(), [&"gunner", &"builder"] as Array[StringName])
	assert_string_contains(config.title, "Robot game: Gunner · Builder, game 1")
	# La partie regardée : deux robots, aucun ordre, vitesses du spectateur.
	SceneRouter.sandbox_config = config
	var screen: Node = GAME.instantiate()
	add_child_autofree(screen)
	var session: Session = screen.get_node("%Session")
	session.set_process(false)
	assert_eq(session.robots.size(), 2)
	assert_true(session.is_spectator())
	assert_false(session.send_command(TargetCommand.new(Vector2i(10, -1))))
	for i: int in range(60):
		session.step()
	assert_false(session.is_running())
	var result: SimRunResult = runner.series[0].results[0]
	var state: GameState = session.simulation.state
	assert_eq(state.colonies[0].cell_count, result.colonies[0].final_cells)
	assert_eq(state.colonies[1].upgrade_levels, result.colonies[1].upgrade_levels)
