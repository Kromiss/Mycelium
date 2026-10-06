class_name BuildWheel
extends Control
## Roue des bâtiments (GDD §5 bis, sans maquette) : au clic droit sur une de mes cases, les
## bâtiments s'ouvrent en éventail au-dessus de la souris, chacun avec son nom et son prix (ou
## le palier requis) ; ceux qui ne peuvent pas être posés là sont grisés et montrent la raison
## au clic. Sur un de mes bâtiments, la roue propose « Démolir ». Échap, un clic droit ailleurs
## ou un choix la ferment.

## Le joueur a choisi un bâtiment à poser sur la case (rang dans SimDefs.buildings).
signal build_chosen(index: int, cell: int)
## Le joueur a choisi de démolir le bâtiment de la case.
signal demolish_chosen(cell: int)
## Un choix grisé a été cliqué : la raison, déjà traduite.
signal refused(text: String)

## Diamètre d'un bouton et distance entre la souris et le centre des boutons, en pixels.
const BUTTON_SIZE: float = 64.0
const RADIUS: float = 118.0
## Écart entre deux boutons voisins, en radians (60°).
const SPREAD: float = PI / 3.0
## Opacité du disque de fond de la roue.
const BACKDROP_ALPHA: float = 0.82
## Largeur réservée au texte sous chaque bouton, en pixels.
const LABEL_WIDTH: float = 150.0

var _session: Session
var _dark: Color = Color.BLACK
## Case de la roue ouverte (−1 : fermée).
var _cell: int = -1
var _center := Vector2.ZERO
var _items: Array[Control] = []
## Position et zone de la dernière ouverture (pour la remettre à jour à chaque tick).
var _at := Vector2.ZERO
var _area := Rect2()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false
	set_anchors_preset(Control.PRESET_FULL_RECT)


## Branche la roue sur une partie, avec la teinte foncée de la colonie du joueur.
func setup(session: Session, dark: Color) -> void:
	_session = session
	_dark = dark


## Vrai si la roue est ouverte.
func is_open() -> bool:
	return visible


## Case de la roue ouverte (−1 : fermée).
func cell() -> int:
	return _cell if visible else -1


## Ouvre la roue pour une de mes cases, centrée sur « at » (pixels d'écran) et gardée dans
## « area ».
func open(cell_index: int, at: Vector2, area: Rect2) -> void:
	close()
	_cell = cell_index
	_at = at
	_area = area
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var building: BuildingState = state.standing_building(cell_index)
	var choices: int = 1 if building != null else state.defs.buildings.size()
	var margin: float = RADIUS + BUTTON_SIZE
	_center = at.clamp(area.position + Vector2(margin, margin), area.end - Vector2(margin, margin))
	for index: int in range(choices):
		var angle: float = -PI / 2.0 + (index - (choices - 1) * 0.5) * SPREAD
		var spot: Vector2 = _center + Vector2(cos(angle), sin(angle)) * RADIUS
		if building != null:
			_add_demolish(spot, building, colony)
		else:
			_add_building(spot, index, colony)
	visible = true
	queue_redraw()


## Remet la roue à jour après un tick (Enzymes, places, case perdue : elle se ferme).
func refresh() -> void:
	if not visible:
		return
	var colony: ColonyState = _session.colony()
	var state: GameState = _session.simulation.state
	if not colony.alive or state.owner[_cell] != colony.id or not _session.accepts_commands():
		close()
		return
	open(_cell, _at, _area)


## Ferme la roue.
func close() -> void:
	for item: Control in _items:
		item.queue_free()
	_items.clear()
	_cell = -1
	visible = false


## Boutons de la roue ouverte, dans l'ordre (pour les tests).
func buttons() -> Array[WheelButton]:
	var found: Array[WheelButton] = []
	for item: Control in _items:
		if item is WheelButton:
			found.append(item as WheelButton)
	return found


func _draw() -> void:
	if _cell < 0:
		return
	var palette: Palette = Settings.palette()
	var backdrop: Color = palette.card
	backdrop.a = BACKDROP_ALPHA
	draw_circle(_center, RADIUS + BUTTON_SIZE * 0.95, backdrop)
	draw_arc(_center, RADIUS + BUTTON_SIZE * 0.95, 0.0, TAU, 64, palette.line, 3.0, true)
	draw_circle(_center, 7.0, _dark)
	draw_arc(_center, 13.0, 0.0, TAU, 24, palette.text_secondary, 3.0, true)


func _add_building(spot: Vector2, index: int, colony: ColonyState) -> void:
	var state: GameState = _session.simulation.state
	var def: SimBuilding = state.defs.buildings[index]
	var command := BuildCommand.new(def.id, state.map.cells[_cell], colony.id)
	var code: Refusal.Code = _session.simulation.check(command)
	var detail: String = (
		tr("HUD_BUILDING_LOCKED") % def.unlock_tier
		if colony.tier < def.unlock_tier
		else tr("HUD_BUILDING_COST") % def.cost_enzymes
	)
	var button := _add_button(spot, def.kind, code == Refusal.Code.OK, tr(def.name_key), detail)
	var cell_index: int = _cell
	button.pressed.connect(
		func() -> void:
			if code != Refusal.Code.OK:
				refused.emit(MapInput.refusal_text(code))
				return
			close()
			build_chosen.emit(index, cell_index)
	)


func _add_demolish(spot: Vector2, building: BuildingState, colony: ColonyState) -> void:
	var state: GameState = _session.simulation.state
	var def: SimBuilding = state.defs.buildings[building.type]
	var command := DemolishCommand.new(state.map.cells[_cell], colony.id)
	var ready: bool = _session.simulation.check(command) == Refusal.Code.OK
	var button := _add_button(spot, -1, ready, tr("HUD_DEMOLISH"), tr(def.name_key))
	var cell_index: int = _cell
	button.pressed.connect(
		func() -> void:
			close()
			demolish_chosen.emit(cell_index)
	)


func _add_button(
	spot: Vector2, kind: int, ready: bool, title: String, detail: String
) -> WheelButton:
	var palette: Palette = Settings.palette()
	var button := WheelButton.new()
	button.kind = kind
	button.ink = _dark if ready else palette.text_secondary
	button.ring = _dark if ready else palette.line
	button.size = Vector2(BUTTON_SIZE, BUTTON_SIZE)
	button.position = spot - button.size * 0.5
	add_child(button)
	_items.append(button)
	var texts := VBoxContainer.new()
	texts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	texts.add_theme_constant_override(&"separation", -4)
	var name: Label = HudStyle.label(&"BoldLabel", title)
	var info: Label = HudStyle.label(&"TinyHintLabel", detail)
	for label: Label in [name, info]:
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.custom_minimum_size = Vector2(LABEL_WIDTH, 0.0)
		label.add_theme_constant_override(&"outline_size", 8)
		label.add_theme_color_override(&"font_outline_color", palette.card)
		texts.add_child(label)
	texts.position = spot + Vector2(-LABEL_WIDTH * 0.5, BUTTON_SIZE * 0.5 + 2.0)
	add_child(texts)
	_items.append(texts)
	return button


## Bouton rond de la roue : disque de la carte, cercle de la colonie (gris s'il est grisé) et
## pictogramme du bâtiment (croix pour « Démolir »).
class WheelButton:
	extends Button

	## Type de bâtiment (BuildingDef.Kind) ; −1 : démolition.
	var kind: int = -1
	var ink: Color = Color.BLACK
	var ring: Color = Color.BLACK

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		flat = true
		action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		for state: StringName in [&"normal", &"hover", &"pressed", &"disabled", &"focus"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())

	func _draw() -> void:
		var palette: Palette = Settings.palette()
		var center: Vector2 = size * 0.5
		var outer: float = minf(size.x, size.y) * 0.5
		var disc: Color = palette.card_hover() if is_hovered() else palette.card
		draw_circle(center, outer, disc)
		draw_arc(center, outer - 2.5, 0.0, TAU, 40, ring, 5.0, true)
		if kind < 0:
			HudIcons.draw_demolish(self, center, outer * 1.1, ink)
		else:
			HudIcons.draw_building(self, kind, center, outer * 1.25, ink)
