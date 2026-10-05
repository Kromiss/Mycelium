extends GutTest
## Combattre des robots (G4, GDD §2.2, §2.3) : partie de Duel ou de FFA contre des robots de
## jeu, secteur et couleurs tirés de la graine, ni pause ni vitesse, abandon confirmé, fin de
## partie minimale.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
const GAME: PackedScene = preload("res://game/game_screen.tscn")
const PLAY: PackedScene = preload("res://ui/play/play_setup.tscn")
const MENU: PackedScene = preload("res://ui/menus/main_menu.tscn")

var _locale: String


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.game_config = null


func _game(config: GameConfig) -> Node:
	SceneRouter.game_config = config
	var screen: Node = GAME.instantiate()
	add_child_autofree(screen)
	var session: Session = screen.get_node("%Session")
	session.set_process(false)
	return screen


func _shown(owner: Node, path: String) -> bool:
	var item: CanvasItem = owner.get_node(path)
	return item.visible


func test_versus_config_draws_sector_and_colours_from_the_seed() -> void:
	var config: GameConfig = GameConfig.versus(FFA, 12, &"normal")
	var again: GameConfig = GameConfig.versus(FFA, 12, &"normal")
	assert_true(config.is_versus())
	assert_eq(config.player_sector, again.player_sector)
	assert_eq(config.colors, again.colors)
	assert_eq(config.colors.size(), 6)
	var sorted: Array = Array(config.colors)
	sorted.sort()
	assert_eq(sorted, [0, 1, 2, 3, 4, 5])
	for sector: int in range(6):
		var expected: StringName = &"" if sector == config.player_sector else &"game_normal"
		assert_eq(config.profiles[sector], expected)
	assert_eq(config.colony_sectors().size(), 6)
	assert_eq(config.player_colony(), config.player_sector)
	var sectors: Dictionary[int, bool] = {}
	var first_colours: Dictionary[int, bool] = {}
	for game_seed: int in range(20):
		var duel: GameConfig = GameConfig.versus(DUEL, game_seed, &"easy")
		sectors[duel.player_sector] = true
		first_colours[duel.colors[0]] = true
	assert_eq(sectors.size(), 2)
	assert_gt(first_colours.size(), 1)
	var next: GameConfig = config.replay_config()
	assert_true(next.is_versus())
	assert_eq(next.mode, FFA)
	assert_eq(next.difficulty, &"normal")


func test_versus_game_has_robots_everywhere_and_no_time_control() -> void:
	var config: GameConfig = GameConfig.versus(FFA, 5, &"hard")
	var screen: Node = _game(config)
	var session: Session = screen.get_node("%Session")
	assert_false(session.has_time_control())
	assert_eq(session.robots.size(), 5)
	assert_eq(session.local_colony, config.player_colony())
	assert_eq(session.colony().sector, config.player_sector)
	assert_eq(session.colors, config.colors)
	for robot: Robot in session.robots:
		assert_eq(robot.difficulty, RobotCatalog.HARD)
		assert_ne(robot.colony_id, session.local_colony)
	session.set_paused(true)
	assert_false(session.paused)
	var hud: Hud = screen.get_node("%Hud")
	assert_false(_shown(hud, "%MenuRecapButton"))
	assert_false(_shown(hud, "%RestartButton"))
	var quit: Button = hud.get_node("%QuitButton")
	assert_eq(quit.text, "GAME_MENU_ABANDON")
	session.step()
	assert_gt(session.replay.commands.size(), 0)


func test_giving_up_asks_for_a_confirmation() -> void:
	var screen: Node = _game(GameConfig.versus(DUEL, 3, &"easy"))
	var hud: Hud = screen.get_node("%Hud")
	hud.open_game_menu()
	var quit: Button = hud.get_node("%QuitButton")
	quit.pressed.emit()
	var yes: Button = hud.get("_confirm_yes")
	var no: Button = hud.get("_confirm_no")
	assert_true(yes.visible)
	assert_false(quit.visible)
	no.pressed.emit()
	assert_false(yes.visible)
	assert_true(quit.visible)
	assert_true(hud.is_game_menu_open())


func test_eliminated_player_ends_at_once_with_the_rank() -> void:
	var screen: Node = _game(GameConfig.versus(FFA, 8, &"easy"))
	var session: Session = screen.get_node("%Session")
	var state: GameState = session.simulation.state
	var killer: ColonyState = state.colonies[(session.local_colony + 1) % 6]
	Combat.eliminate(state, session.colony(), killer, TickResult.new())
	session.step()
	assert_false(session.is_running())
	var hud: Hud = screen.get_node("%Hud")
	assert_true(_shown(hud, "%EndPanel"))
	var title: Label = hud.get_node("%EndTitle")
	assert_eq(title.text, "Rank 6 of 6")
	var summary: Label = hud.get_node("%EndSummary")
	assert_string_contains(summary.text, "Cells captured: ")
	assert_string_contains(summary.text, "Sporophores destroyed: 0")
	assert_string_contains(summary.text, "Survival: 00:01")
	assert_string_contains(summary.text, "Peak production: ")
	assert_false(_shown(hud, "%EndRecapButton"))
	var replay: Button = hud.get_node("%ReplayButton")
	assert_eq(replay.text, "END_PLAY_AGAIN")


func test_beating_the_duel_robot_is_a_victory() -> void:
	var screen: Node = _game(GameConfig.versus(DUEL, 4, &"easy"))
	var session: Session = screen.get_node("%Session")
	var state: GameState = session.simulation.state
	var robot: ColonyState = state.colonies[1 - session.local_colony]
	Combat.eliminate(state, robot, session.colony(), TickResult.new())
	session.step()
	assert_false(session.is_running())
	var title: Label = screen.get_node("%Hud").get_node("%EndTitle")
	assert_eq(title.text, "Victory!")


func test_sandbox_still_has_its_own_end_and_menu() -> void:
	var screen: Node = _game(GameConfig.defaults(DUEL, 2))
	var hud: Hud = screen.get_node("%Hud")
	assert_true(_shown(hud, "%RestartButton"))
	var quit: Button = hud.get_node("%QuitButton")
	assert_eq(quit.text, "GAME_MENU_QUIT")


func test_sandbox_offers_game_robots_on_free_sectors() -> void:
	var config: GameConfig = GameConfig.defaults(DUEL, 2)
	config.profiles[1] = &"game_easy"
	var screen: Node = _game(config)
	var session: Session = screen.get_node("%Session")
	assert_true(session.has_time_control())
	assert_eq(session.robots.size(), 1)
	assert_eq(session.robots[0].difficulty, RobotCatalog.EASY)
	assert_eq(session.local_colony, 0)


func test_play_setup_picks_a_difficulty() -> void:
	SceneRouter.play_mode = &"ffa"
	var setup: Node = PLAY.instantiate()
	add_child_autofree(setup)
	var title: Label = setup.get_node("%Title")
	assert_eq(title.text, "PLAY_FFA_TITLE")
	var difficulty: RobotDifficulty = setup.call("difficulty")
	assert_eq(difficulty, RobotCatalog.NORMAL)
	setup.call("select", 2)
	difficulty = setup.call("difficulty")
	assert_eq(difficulty, RobotCatalog.HARD)
	assert_eq(SceneRouter.play_difficulty, 2)
	var hint: Label = setup.get_node("%DifficultyHint")
	assert_eq(hint.text, "PLAY_HARD_HINT")
	SceneRouter.play_difficulty = 1
	SceneRouter.play_mode = &"duel"


func test_menu_opens_duel_and_ffa() -> void:
	var menu: Node = MENU.instantiate()
	add_child_autofree(menu)
	var duel: Button = menu.get_node("%DuelButton")
	var ffa: Button = menu.get_node("%FfaButton")
	assert_false(duel.disabled)
	assert_false(ffa.disabled)
	assert_eq(duel.text, "MENU_DUEL")
