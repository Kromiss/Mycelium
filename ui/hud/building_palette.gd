class_name BuildingPalette
extends HBoxContainer
## Palette des bâtiments en bas de l'écran (GDD §7.4, §13.6, décidé le 4 octobre 2026) : un
## bouton par bâtiment avec son coût, un cadenas s'il n'est pas débloqué et sa touche (1 à 5,
## modifiables). Choisir un bâtiment passe en mode palette ; le rechoisir en sort.

## Un bâtiment a été choisi (ou rechoisi) dans la palette.
signal selected(building: StringName)

## Nombre de bâtiments qui ont une touche de raccourci.
const SHORTCUTS: int = 5

var _session: Session
var _buttons: Array[BuildingButton] = []
var _placing: StringName = &""


## Action de raccourci du bâtiment n° « index » de la palette (à partir de 0).
static func shortcut_action(index: int) -> StringName:
	return StringName("build_%d" % (index + 1))


## Crée les boutons pour une partie.
func setup(session: Session, dark: Color) -> void:
	_session = session
	for child: Node in get_children():
		child.queue_free()
	_buttons.clear()
	var buildings: Array[SimBuilding] = session.simulation.state.defs.buildings
	for index: int in range(buildings.size()):
		var button := BuildingButton.new()
		button.building = buildings[index]
		button.dark = dark
		button.toggle_mode = true
		var id: StringName = buildings[index].id
		button.pressed.connect(func() -> void: selected.emit(id))
		add_child(button)
		_buttons.append(button)
	refresh()


## Bâtiment choisi (vide : aucun).
func set_placing(building: StringName) -> void:
	_placing = building
	refresh()


## Met à jour coûts, cadenas et touches.
func refresh() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var full: bool = Buildings.placed_count(state, colony) >= Buildings.slots(state, colony)
	for index: int in range(_buttons.size()):
		var button: BuildingButton = _buttons[index]
		var building: SimBuilding = button.building
		var type: int = state.defs.building_index(building.id)
		var locked: bool = not Buildings.is_unlocked(state, colony, type)
		var cost: int = Buildings.cost(state, colony, type)
		var affordable: bool = (
			not full
			and cost <= colony.nutrients
			and Buildings.enzyme_cost(state, type) <= colony.enzymes
		)
		button.key_text = (
			ControlsText.action_key(shortcut_action(index)) if index < SHORTCUTS else ""
		)
		button.set_pressed_no_signal(building.id == _placing)
		button.show_state(
			BuildingText.cost_text(_session, building),
			locked,
			affordable,
			_tooltip(building, locked, full)
		)


func _tooltip(building: SimBuilding, locked: bool, full: bool) -> String:
	var lines := PackedStringArray([BuildingText.name_of(building)])
	lines.append_array(BuildingText.effects(building))
	if locked:
		lines.append(BuildingText.locked_line(_session.simulation.state.defs, building.unlock_tier))
	elif full:
		lines.append(MapInput.refusal_text(Refusal.Code.NO_BUILDING_SLOT))
	return "\n".join(lines)
