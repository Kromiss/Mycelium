extends GutTest
## Bac à sable (GDD §2.1 bis) : écran de réglages, gestes sur la carte, pause, récapitulatif.
## Affichage provisoire de G3 (étape 1).

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const SETUP: PackedScene = preload("res://ui/sandbox/sandbox_setup.tscn")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")
## Cases de la colonie en Duel (rayon 11) : une case libre collée au territoire de départ,
## une case qui ne le touche pas, et la case de départ vers le centre.
const ABOVE := Vector2i(10, -1)
const BEYOND := Vector2i(8, 0)
const INNER := Vector2i(10, 0)

var _locale: String


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	SceneRouter.sandbox_config = SandboxConfig.defaults(DUEL, 7)


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.sandbox_config = null


func _game() -> Node:
	var screen: Node = GAME.instantiate()
	add_child_autofree(screen)
	var session: Session = screen.get_node("%Session")
	session.set_process(false)
	return screen


func _index(session: Session, cell: Vector2i) -> int:
	return session.simulation.cell_index(cell)


func test_setup_starts_from_defaults_and_resets() -> void:
	SceneRouter.sandbox_config = null
	var setup: Node = SETUP.instantiate()
	add_child_autofree(setup)
	var config: SandboxConfig = setup.call("config")
	assert_eq(config.defs.to_dict(), SimDefs.from_mode(DUEL).to_dict())
	config.defs.unit_cost = 1
	setup.call("_on_defaults")
	config = setup.call("config")
	assert_eq(config.defs.unit_cost, 30_000)


func test_setup_switches_forest_and_keeps_edits() -> void:
	SceneRouter.sandbox_config = null
	var setup: Node = SETUP.instantiate()
	add_child_autofree(setup)
	var config: SandboxConfig = setup.call("config")
	config.defs.cell_yield = 5_000
	setup.call("_on_forest_selected", 1)
	assert_eq(config.mode.id, &"ffa")
	assert_eq(config.defs.sectors, 6)
	assert_eq(config.defs.radius(), 17)
	assert_eq(config.defs.cell_yield, 5_000)


func test_setup_refuses_invalid_settings() -> void:
	SceneRouter.sandbox_config = null
	var setup: Node = SETUP.instantiate()
	add_child_autofree(setup)
	var config: SandboxConfig = setup.call("config")
	config.defs.turret_range = 0
	setup.call("_on_launch")
	var error: Label = setup.get_node("%ErrorLabel")
	assert_string_contains(error.text, "General")


func test_game_starts_alone_on_the_chosen_forest() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	assert_eq(session.simulation.state.colonies.size(), 1)
	assert_eq(session.simulation.state.game_seed, 7)
	assert_true(session.has_time_control())


func test_click_targets_a_cell_and_refusals_show_a_message() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	input.click(_index(session, BEYOND))
	assert_eq(messages, ["This cell does not touch your colony"])
	input.click(_index(session, ABOVE))
	session.step()
	assert_eq(session.colony().designated, _index(session, ABOVE))


func test_move_key_then_click_makes_the_sporophore_step() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	input.set_moving(true)
	input.click(_index(session, INNER))
	assert_false(input.is_moving())
	session.step()
	assert_eq(session.colony().move_to, _index(session, INNER))


func test_orders_are_blocked_while_paused() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	session.set_paused(true)
	input.click(_index(session, ABOVE))
	assert_eq(messages, ["Paused: orders are blocked"])
	assert_false(session.send_command(TargetCommand.new(ABOVE)))
	session.set_paused(false)
	session.step()
	assert_eq(session.colony().designated, -1)


func test_game_menu_pauses_and_resumes() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var hud: Hud = screen.get_node("%Hud")
	hud.open_game_menu()
	assert_true(session.paused)
	assert_true(hud.is_game_menu_open())
	hud.close_game_menu()
	assert_false(session.paused)
	# Un jeu déjà en pause le reste après le menu.
	session.set_paused(true)
	hud.open_game_menu()
	hud.close_game_menu()
	assert_true(session.paused)


func test_game_ends_at_the_time_limit_with_the_end_panel() -> void:
	SceneRouter.sandbox_config.defs.match_ticks = 3
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	for i: int in range(5):
		session.step()
	assert_false(session.is_running())
	assert_eq(session.simulation.state.tick, 3)
	var hud: Hud = screen.get_node("%Hud")
	var end_panel: Control = hud.get_node("%EndPanel")
	assert_true(end_panel.visible)


func test_recap_lists_settings_and_results() -> void:
	var config: SandboxConfig = SandboxConfig.defaults(DUEL, 42)
	var simulation := Simulation.new(config.defs.duplicate_defs(), 42, 1)
	for i: int in range(5):
		simulation.tick()
	var text: String = SandboxRecap.build(config, simulation.state, simulation.state.colonies[0])
	for expected: String in [
		"Sandbox",
		"Duel forest (radius 11) · seed 42",
		"U: cost unit of upgrades: 30",
		"Sporophore: damage per spore: 10",
		"Zone 2 — Richness ×: 1.5, Free cell HP ×: 1.4, Owned cell HP ×: 1.2",
		"Damage — Effect per level: 250",
		"Salvo — Enzymes: 20",
		"Results at 00:05",
		"Cells: 4 · tier 0 (×1)",
		"cells captured: 1",
		"Upgrades: none",
		"Tiers reached: none",
	]:
		assert_string_contains(text, expected)


func test_tooltip_shows_owner_health_zone_and_whether_it_can_be_targeted() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var hud: Hud = screen.get_node("%Hud")
	hud.set_tooltip_cell(_index(session, ABOVE))
	var label: Label = hud.get_node("%TooltipLabel")
	assert_eq(label.text, "Free cell\nHP: 40 / 40\nZone 1\nClick to target")
	hud.set_tooltip_cell(session.colony().turret)
	assert_string_contains(label.text, "Sporophore\nHP: 400 / 400")
	hud.show_message("x")
	var toast: Label = hud.get_node("%ToastLabel")
	assert_eq(toast.text, "x")
