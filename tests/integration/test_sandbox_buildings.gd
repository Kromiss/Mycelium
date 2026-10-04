extends GutTest
## Bâtiments dans le Bac à sable (GDD §7.4, §13.2, §13.6) : palette, mode palette, menu rond,
## panneau d'un bâtiment, file de construction du HUD, info-bulle, réglages et récapitulatif.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")
const SETUP: PackedScene = preload("res://ui/sandbox/sandbox_setup.tscn")
## Cases de départ de la colonie en Duel (rayon 11), Cœur compris, et une case libre voisine.
const HEART := Vector2i(11, 0)
const INNER := Vector2i(10, 0)
const EDGE := Vector2i(11, -1)
const ABOVE := Vector2i(10, -1)

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


func test_palette_shows_every_building_with_cost_and_lock() -> void:
	var screen: Node = _game()
	var palette: BuildingPalette = screen.get_node("%Hud").get_node("%Palette")
	assert_eq(palette.get_child_count(), 5)
	var node: BuildingButton = palette.get_child(0)
	var granary: BuildingButton = palette.get_child(1)
	assert_eq(node.cost_text, "60")
	assert_false(node.locked)
	assert_eq(node.key_text, "1")
	assert_true(granary.locked)
	assert_string_contains(granary.tooltip_text, "Disabled: tier 1 required (5 cells)")


func test_placing_mode_builds_on_click_and_refuses_locked_buildings() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var messages: Array[String] = []
	input.message.connect(func(text: String) -> void: messages.append(text))
	input.toggle_placing(&"granary")
	assert_eq(input.placing(), &"")
	assert_eq(messages, ["Your colony has not reached the tier for this building"])
	input.toggle_placing(&"digestion_node")
	assert_eq(input.placing(), &"digestion_node")
	assert_true(input.build(_index(session, INNER), &"digestion_node"))
	# Deux poses sur la même case avant le tick : la seconde n'est pas envoyée.
	assert_false(input.build(_index(session, INNER), &"digestion_node"))
	assert_false(input.build(_index(session, HEART), &"digestion_node"))
	session.step()
	var state: GameState = session.simulation.state
	assert_eq(state.building_state[_index(session, INNER)], GameState.BuildState.CONSTRUCTING)
	assert_eq(messages[messages.size() - 1], "The Heart takes up this cell")
	input.toggle_placing(&"digestion_node")
	assert_eq(input.placing(), &"")


func test_click_on_the_colony_opens_the_round_menu_or_the_panel() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	input.click(_index(session, INNER))
	var radial: RadialMenu = hud.get_node("%RadialMenu")
	assert_true(radial.is_open())
	# Seuls les bâtiments débloqués : le Nœud de digestion au départ.
	assert_eq(radial.get_child_count(), 1)
	hud.build_chosen.emit(_index(session, INNER), &"digestion_node")
	session.step()
	hud.close_menus()
	input.click(_index(session, INNER))
	var panel: BuildingPanel = hud.get_node("%BuildingPanel")
	assert_true(panel.is_open())
	assert_false(radial.is_open())
	var info: Label = panel.get_child(0).get_child(1)
	assert_string_contains(info.text, "Under construction: 2 s left")
	var button: Button = panel.get_child(0).get_child(2)
	assert_eq(button.text, "Cancel (+30)")
	# Le Cœur n'ouvre rien.
	hud.close_menus()
	input.click(_index(session, HEART))
	assert_false(hud.is_menu_open())


func test_demolish_from_the_panel_refunds_and_closes_it() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	input.build(_index(session, INNER), &"digestion_node")
	for i: int in range(3):
		session.step()
	var state: GameState = session.simulation.state
	assert_eq(state.building_state[_index(session, INNER)], GameState.BuildState.BUILT)
	hud.open_building_panel(_index(session, INNER))
	var panel: BuildingPanel = hud.get_node("%BuildingPanel")
	var button: Button = panel.get_child(0).get_child(2)
	assert_eq(button.text, "Demolish (+30)")
	var info: Label = panel.get_child(0).get_child(1)
	assert_eq(
		info.text, "Active\n+30 % production for your cells within 2 cells\nCovers 3 of your cells"
	)
	button.pressed.emit()
	session.step()
	assert_eq(state.building[_index(session, INNER)], -1)
	assert_false(panel.is_open())


func test_hud_shows_stock_cap_enzymes_and_build_queue() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	session.colony().nutrients = 300_000
	input.build(_index(session, INNER), &"digestion_node")
	input.build(_index(session, EDGE), &"digestion_node")
	session.step()
	input.build(_index(session, ABOVE), &"digestion_node")
	session.colony().nutrients = 300_000
	session.step()
	var queue: BuildQueueView = hud.get_node("%BuildQueue")
	var label: Label = queue.get_child(0)
	assert_eq(label.text, "Buildings: 2 / 2 · Sites: 2 / 2 · Build queue: 2 / 5")
	var enzymes: Label = hud.get_node("%EnzymesLabel")
	assert_eq(enzymes.text, "0 · +0 /min")
	var stock: Label = hud.get_node("%StockLabel")
	assert_eq(stock.text, NumberFormat.amount(session.colony().stock_cap))


func test_cancel_from_the_build_queue_sends_a_demolish_command() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	input.build(_index(session, INNER), &"digestion_node")
	session.step()
	var nutrients: int = session.colony().nutrients
	hud.demolish_requested.emit(_index(session, INNER))
	session.step()
	assert_eq(session.simulation.state.building[_index(session, INNER)], -1)
	assert_eq(session.colony().nutrients, nutrients + 30_000 + session.colony().production)


func test_tooltip_shows_the_building_and_the_placing_cost() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	input.build(_index(session, INNER), &"digestion_node")
	session.step()
	hud.set_tooltip_cell(_index(session, INNER))
	var label: Label = hud.get_node("%TooltipLabel")
	assert_string_contains(label.text, "Digestion Node\nUnder construction: 2 s left")
	assert_string_contains(label.text, "+30 % production for your cells within 2 cells")
	input.set_placing(&"digestion_node")
	session.colony().nutrients = 5_000_000
	hud.set_tooltip_cell(_index(session, EDGE))
	var cost: String = NumberFormat.amount(session.simulation.building_cost(0, &"digestion_node"))
	assert_string_contains(label.text, "Build Digestion Node here: " + cost)
	hud.set_tooltip_cell(_index(session, INNER))
	assert_string_contains(label.text, "This cell already has a building")


func test_escape_closes_menus_then_leaves_placing_mode_then_opens_the_game_menu() -> void:
	var screen: Node = _game()
	var session: Session = screen.get_node("%Session")
	var input: MapInput = screen.get_node("%MapInput")
	var hud: Hud = screen.get_node("%Hud")
	input.set_placing(&"digestion_node")
	hud.open_build_menu(_index(session, INNER))
	var escape := InputEventAction.new()
	escape.action = &"back_to_menu"
	escape.pressed = true
	screen.call("_unhandled_input", escape)
	assert_false(hud.is_menu_open())
	assert_eq(input.placing(), &"digestion_node")
	screen.call("_unhandled_input", escape)
	assert_eq(input.placing(), &"")
	assert_false(hud.is_game_menu_open())
	screen.call("_unhandled_input", escape)
	assert_true(hud.is_game_menu_open())


func test_shortcut_keys_choose_a_palette_building() -> void:
	var screen: Node = _game()
	var input: MapInput = screen.get_node("%MapInput")
	var key := InputEventAction.new()
	key.action = &"build_1"
	key.pressed = true
	screen.call("_unhandled_input", key)
	assert_eq(input.placing(), &"digestion_node")
	screen.call("_unhandled_input", key)
	assert_eq(input.placing(), &"")


func test_setup_has_every_building_setting() -> void:
	SceneRouter.sandbox_config = null
	var setup: Node = SETUP.instantiate()
	add_child_autofree(setup)
	var config: SandboxConfig = setup.call("config")
	var form: Node = setup.get_node("%SettingsForm")
	var grid: GridContainer = form.get_node("%BuildingsGrid")
	# Une ligne d'en-têtes puis une ligne par réglage, une colonne par bâtiment.
	assert_eq(grid.columns, 6)
	assert_eq(grid.get_child_count(), 6 * (1 + SandboxParam.BUILDING_FIELDS.size()))
	var params: Array[SandboxParam] = SandboxParam.all(6, 6, config.defs.buildings)
	var cost: SandboxParam = null
	var refund: SandboxParam = null
	for param: SandboxParam in params:
		if param.id == "nursery.cost_units":
			cost = param
		elif param.id == "demolish_refund_pm":
			refund = param
	assert_eq(cost.read(config.defs), 4.0)
	cost.write(config.defs, 9.0)
	assert_eq(config.defs.buildings[2].cost_units, 9)
	assert_eq(cost.label(), "Nursery · Minimum cost (U)")
	assert_eq(refund.read(config.defs), 50.0)
	refund.write(config.defs, 25.0)
	assert_eq(config.defs.demolish_refund_pm, 250)


func test_recap_lists_building_settings_and_results() -> void:
	var config: SandboxConfig = SandboxConfig.defaults(DUEL, 42)
	var simulation := Simulation.new(config.defs.duplicate_defs(), 42, 1)
	simulation.tick([BuildCommand.new(INNER, &"digestion_node")])
	for i: int in range(3):
		simulation.tick()
	var text: String = SandboxRecap.build(config, simulation.state, simulation.state.colonies[0])
	for expected: String in [
		"Buildings: 2 places + 1 per tier · stock cap 180 s · growths max 3 · sites 2 → 4",
		"Nursery: 60 s of production (at least 4 U), tier 1, Growth −30 % within 3 cells",
		"Enzymes: 0 (+0/min)",
		"Buildings: Digestion Node ×1",
	]:
		assert_string_contains(text, expected)
