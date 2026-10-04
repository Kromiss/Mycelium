class_name RadialMenu
extends Control
## Menu rond d'une case libre de la colonie (GDD §7.4, décidé le 4 octobre 2026) : les
## bâtiments débloqués, en cercle autour de la case ; ceux trop chers sont grisés.

## Un bâtiment a été choisi pour la case.
signal chosen(cell: int, building: StringName)

## Distance des boutons au centre, en pixels.
const RING_RADIUS: float = 92.0

var _session: Session
var _cell: int = -1
var _center := Vector2.ZERO
var _buttons: Array[BuildingButton] = []


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false


## Ouvre le menu sur une case, avec les bâtiments débloqués de la colonie.
func open(session: Session, cell: int, dark: Color) -> void:
	close()
	_session = session
	_cell = cell
	var state: GameState = session.simulation.state
	var colony: ColonyState = session.colony()
	for type: int in range(state.defs.buildings.size()):
		if not Buildings.is_unlocked(state, colony, type):
			continue
		var building: SimBuilding = state.defs.buildings[type]
		var button := BuildingButton.new()
		button.building = building
		button.dark = dark
		var id: StringName = building.id
		button.pressed.connect(func() -> void: chosen.emit(_cell, id))
		add_child(button)
		_buttons.append(button)
	refresh()
	visible = true
	_place_buttons()


## Ferme le menu.
func close() -> void:
	for button: BuildingButton in _buttons:
		button.queue_free()
	_buttons.clear()
	_cell = -1
	visible = false


## Vrai si le menu est ouvert.
func is_open() -> bool:
	return visible


## Case du menu (−1 s'il est fermé).
func cell() -> int:
	return _cell


## Position à l'écran de la case (suit la caméra).
func set_center(point: Vector2) -> void:
	if point.is_equal_approx(_center):
		return
	_center = point
	_place_buttons()


## Met à jour coûts et boutons grisés.
func refresh() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var full: bool = Buildings.placed_count(state, colony) >= Buildings.slots(state, colony)
	for button: BuildingButton in _buttons:
		var type: int = state.defs.building_index(button.building.id)
		var affordable: bool = (
			not full
			and Buildings.cost(state, colony, type) <= colony.nutrients
			and Buildings.enzyme_cost(state, type) <= colony.enzymes
		)
		button.disabled = not affordable
		var lines := PackedStringArray([BuildingText.name_of(button.building)])
		lines.append_array(BuildingText.effects(button.building))
		button.show_state(
			BuildingText.cost_text(_session, button.building), false, affordable, "\n".join(lines)
		)


func _place_buttons() -> void:
	var count: int = _buttons.size()
	for index: int in range(count):
		var button: BuildingButton = _buttons[index]
		var angle: float = -PI / 2.0 + TAU * index / maxi(1, count)
		var offset: Vector2 = Vector2(cos(angle), sin(angle)) * RING_RADIUS
		button.position = _center + offset - button.custom_minimum_size * 0.5
		button.size = button.custom_minimum_size
