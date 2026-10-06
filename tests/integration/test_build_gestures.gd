extends GutTest
## Gestes de construction (GDD §5 bis) : roue au clic droit sur une de mes cases (Démolir sur un
## de mes bâtiments), bouton du panneau puis clic, choix grisés, carte qui glisse au clic du
## milieu.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const GAME: PackedScene = preload("res://game/game_screen.tscn")
const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _locale: String
var _screen: Node
var _session: Session
var _hud: Hud
var _input: MapInput


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	SceneRouter.game_config = GameConfig.defaults(DUEL, 7)
	_screen = GAME.instantiate()
	add_child_autofree(_screen)
	_session = _screen.get_node("%Session")
	_session.set_process(false)
	_hud = _screen.get_node("%Hud")
	_input = _screen.get_node("%MapInput")


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.game_config = null


func _colony() -> ColonyState:
	return _session.colony()


func _inner() -> int:
	return _session.simulation.cell_index(Fixture.INNER_0)


## Palier 1 et de quoi payer un Essaimeur, tout juste.
func _ready_to_build() -> void:
	_colony().tier = 1
	_colony().enzymes = Fixed.from_units(_session.simulation.state.defs.buildings[0].cost_enzymes)
	_hud.buildings.refresh()


func test_right_click_on_my_cell_opens_the_wheel_and_builds() -> void:
	_ready_to_build()
	_input.right_click(_inner(), Vector2(400, 500))
	assert_true(_hud.wheel.is_open())
	assert_eq(_hud.wheel.cell(), _inner())
	assert_eq(_hud.wheel.buttons().size(), 3)
	_hud.wheel.buttons()[0].pressed.emit()
	assert_false(_hud.wheel.is_open())
	var building: BuildingState = _session.simulation.building_on(_inner())
	assert_not_null(building)
	assert_eq(building.type, 0)
	assert_eq(_colony().enzymes, 0)


func test_greyed_choices_tell_why() -> void:
	_ready_to_build()
	_input.right_click(_inner(), Vector2(400, 500))
	_hud.wheel.buttons()[1].pressed.emit()
	assert_true(_hud.wheel.is_open())
	assert_null(_session.simulation.building_on(_inner()))
	var toast: Label = _hud.get_node("%ToastLabel")
	assert_eq(toast.text, MapInput.refusal_text(Refusal.Code.TIER_LOCKED))


func test_right_click_on_my_building_offers_to_demolish_it() -> void:
	_ready_to_build()
	_session.send_command(BuildCommand.new(&"swarmer", Fixture.INNER_0))
	_input.right_click(_inner(), Vector2(400, 500))
	assert_eq(_hud.wheel.buttons().size(), 1)
	assert_eq(_hud.wheel.buttons()[0].kind, -1)
	_hud.wheel.buttons()[0].pressed.emit()
	assert_null(_session.simulation.building_on(_inner()))
	assert_eq(_session.simulation.building_slots(0), PackedInt32Array([0, 1]))


func test_right_click_elsewhere_or_escape_closes_the_wheel() -> void:
	_ready_to_build()
	_input.right_click(_inner(), Vector2(400, 500))
	_input.right_click(_session.simulation.cell_index(Vector2i(5, 0)), Vector2(400, 500))
	assert_false(_hud.wheel.is_open())
	_input.right_click(_colony().turret, Vector2(400, 500))
	assert_false(_hud.wheel.is_open())
	_input.right_click(_inner(), Vector2(400, 500))
	var escape := InputEventAction.new()
	escape.action = &"back_to_menu"
	escape.pressed = true
	_screen._unhandled_input(escape)
	assert_false(_hud.wheel.is_open())
	assert_false(_hud.is_game_menu_open())


func test_panel_button_then_click_builds_on_my_cell() -> void:
	_ready_to_build()
	assert_eq(_hud.buildings.slots_text(), "0 / 1 slots")
	_hud.buildings.button(0).pressed.emit()
	assert_eq(_input.mode(), MapInput.Mode.BUILD)
	assert_eq(_input.pending_building(), 0)
	var hint: Label = _hud.get_node("%HintLabel")
	assert_string_starts_with(hint.text, "Swarmer")
	_input.click(_inner())
	assert_not_null(_session.simulation.building_on(_inner()))
	assert_eq(_input.mode(), MapInput.Mode.TARGET)
	assert_eq(_hud.buildings.slots_text(), "1 / 1 slots")


func test_panel_button_refuses_a_locked_building() -> void:
	_ready_to_build()
	_hud.buildings.button(2).pressed.emit()
	assert_eq(_input.mode(), MapInput.Mode.TARGET)
	var toast: Label = _hud.get_node("%ToastLabel")
	assert_eq(toast.text, MapInput.refusal_text(Refusal.Code.TIER_LOCKED))
	assert_eq(_hud.buildings.button(2).text, "Tier 3")


func test_a_right_click_cancels_the_build_gesture() -> void:
	_ready_to_build()
	_hud.buildings.button(0).pressed.emit()
	_input.right_click(_inner(), Vector2(400, 500))
	assert_eq(_input.mode(), MapInput.Mode.TARGET)
	assert_false(_hud.wheel.is_open())


func test_the_map_drags_with_the_middle_button() -> void:
	var drag: Array[InputEvent] = InputMap.action_get_events(&"camera_drag")
	assert_eq(drag.size(), 1)
	assert_eq((drag[0] as InputEventMouseButton).button_index, MOUSE_BUTTON_MIDDLE)
