extends GutTest
## Bac à sable (GDD §2.1 bis) : écran de réglages, gestes sur la carte, pause, récapitulatif.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const SETUP: PackedScene = preload("res://ui/sandbox/sandbox_setup.tscn")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")
## Cases de la colonie en Duel (rayon 11) : une case libre collée au réseau de départ, une case
## qui ne le touche pas, et une case collée seulement à la première.
const ABOVE := Vector2i(10, -1)
const BELOW := Vector2i(10, 1)
const BEYOND := Vector2i(9, -1)

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
	config.defs.expansion_queue_size = 0
	setup.call("_on_launch")
	var error: Label = setup.get_node("%ErrorLabel")
	assert_string_contains(error.text, "queue")


func test_game_starts_alone_on_the_chosen_forest() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	assert_eq(session.simulation.state.colonies.size(), 1)
	assert_eq(session.simulation.state.game_seed, 7)
	assert_true(session.has_time_control())


func test_click_colonizes_and_refusals_show_a_message() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	input.click(_index(session, BEYOND))
	assert_eq(messages, ["This cell does not touch your network"])
	input.click(_index(session, ABOVE))
	session.step()
	assert_eq(session.colony().growing, PackedInt32Array([_index(session, ABOVE)]))


func test_queue_drag_follows_the_path_and_stops_at_the_first_invalid_cell() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	input.queue_click(_index(session, ABOVE))
	input.drag_over(_index(session, BEYOND))
	input.drag_over(_index(session, ABOVE))
	input.drag_over(_index(session, Vector2i(0, 0)))
	input.drag_over(_index(session, BELOW))
	session.step()
	# ABOVE pousse ; BEYOND attend. Le tracé s'est arrêté au centre : BELOW n'est pas ajoutée.
	assert_eq(session.colony().growing, PackedInt32Array([_index(session, ABOVE)]))
	assert_eq(session.colony().queue, PackedInt32Array([_index(session, BEYOND)]))
	assert_eq(messages, ["This cell does not touch your network"])


func test_queue_click_on_a_queued_cell_removes_it() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	session.colony().nutrients = 0
	input.queue_click(_index(session, ABOVE))
	session.step()
	assert_eq(session.colony().queue, PackedInt32Array([_index(session, ABOVE)]))
	input.queue_click(_index(session, ABOVE))
	session.step()
	assert_true(session.colony().queue.is_empty())


func test_orders_are_blocked_while_paused() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	session.set_paused(true)
	input.click(_index(session, ABOVE))
	assert_eq(messages, ["Paused: orders are blocked"])
	assert_false(session.send_command(ColonizeCommand.new(ABOVE)))
	session.set_paused(false)
	session.step()
	assert_true(session.colony().growing.is_empty())


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
		"U: 30 · zone 1 yield: 3.333/s · zone 1 growth: 4 s · starting stock: 6 U",
		"cohesion: +5 % per neighbour",
		"5 → ×2",
		"2 ×1.5 / ×1.4 / ×1.2",
		"Results at 00:05",
		"Grown cells: 3 · tier 0 (×1)",
		"Tiers reached: none",
	]:
		assert_string_contains(text, expected)


func test_tooltip_shows_zone_cost_growth_and_production() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var hud: Hud = screen.get_node("%Hud")
	hud.set_tooltip_cell(_index(session, ABOVE))
	var label: Label = hud.get_node("%TooltipLabel")
	assert_eq(label.text, "Free cell\nZone 1\nCost: 30\nGrowth: 4 s\nOnce grown: 3.7 /s")
	hud.set_tooltip_cell(session.colony().heart)
	assert_string_contains(label.text, "Heart of your colony")
	hud.show_message("x")
	var toast: Label = hud.get_node("%ToastLabel")
	assert_eq(toast.text, "x")
