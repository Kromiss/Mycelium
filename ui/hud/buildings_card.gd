class_name BuildingsCard
extends PanelContainer
## « Bâtiments » (panneau de droite, sous les mutations ; GDD §5 bis, sans maquette) : une ligne,
## le titre et les places prises, puis un bouton par bâtiment (pictogramme et prix en Enzymes,
## ou palier requis). Un clic sur un bouton, puis un clic sur une de mes cases, pose le bâtiment
## (MapInput) ; le bouton du geste en cours est plein. Nom et rôle dans l'info-bulle.

## Le joueur a cliqué sur un bâtiment (rang dans SimDefs.buildings).
signal building_pressed(index: int)

## Hauteur d'un bouton, en pixels.
const BUTTON_HEIGHT: float = 44.0

var _session: Session
var _dark: Color = Color.BLACK
var _slots: Label
var _row: HBoxContainer
var _buttons: Array[BuildingButton] = []
## Bâtiment du geste de construction en cours (−1 : aucun).
var _pending: int = -1


func _init() -> void:
	theme_type_variation = &"GameCard"
	var line := HBoxContainer.new()
	line.add_theme_constant_override(&"separation", 10)
	line.custom_minimum_size = Vector2(0.0, BUTTON_HEIGHT)
	add_child(line)
	var title: Label = HudStyle.label(&"TinyBoldHintLabel", "HUD_BUILDINGS")
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(title)
	_slots = HudStyle.label(&"TinyHintLabel")
	_slots.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_slots.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(_slots)
	_row = HBoxContainer.new()
	_row.add_theme_constant_override(&"separation", 8)
	line.add_child(_row)


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and _session != null:
		refresh()


## Branche la carte sur une partie, avec la teinte foncée de la colonie du joueur.
func setup(session: Session, dark: Color) -> void:
	_session = session
	_dark = dark
	var defs: SimDefs = session.simulation.state.defs
	for index: int in range(defs.buildings.size()):
		var button := BuildingButton.new()
		button.kind = defs.buildings[index].kind
		button.custom_minimum_size = Vector2(0.0, BUTTON_HEIGHT)
		# Réagit dès l'appui (pas au relâchement) : le geste commence tout de suite.
		button.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		button.pressed.connect(func() -> void: building_pressed.emit(index))
		_row.add_child(button)
		_buttons.append(button)
	refresh()


## Geste de construction en cours (−1 : aucun) : son bouton est plein.
func set_pending(index: int) -> void:
	_pending = index
	refresh()


## Bouton d'un bâtiment (pour les tests).
func button(index: int) -> BuildingButton:
	return _buttons[index]


## Texte des places (pour les tests).
func slots_text() -> String:
	return _slots.text


## Met à jour les places et l'état des boutons.
func refresh() -> void:
	if _session == null:
		return
	var simulation: Simulation = _session.simulation
	var state: GameState = simulation.state
	var colony: ColonyState = _session.colony()
	var palette: Palette = Settings.palette()
	var slots: PackedInt32Array = simulation.building_slots(colony.id)
	_slots.text = tr("HUD_BUILDING_SLOTS") % [slots[0], slots[1]]
	for index: int in range(_buttons.size()):
		var def: SimBuilding = state.defs.buildings[index]
		var button: BuildingButton = _buttons[index]
		var code: Refusal.Code = simulation.check_building_type(colony.id, def.id)
		var locked: bool = colony.tier < def.unlock_tier
		button.text = (
			tr("HUD_BUILDING_LOCKED") % def.unlock_tier
			if locked
			else tr("HUD_BUILDING_COST") % def.cost_enzymes
		)
		button.tooltip_text = "%s\n%s" % [tr(def.name_key), tr(def.name_key + "_DESC")]
		var ready: bool = code == Refusal.Code.OK
		var background: Color = palette.card
		var ink: Color = _dark if ready else palette.text_secondary
		var border: Color = _dark if ready else palette.line
		if index == _pending:
			background = _dark
			ink = palette.card
			border = _dark
		HudStyle.paint_button(button, background, border, ink, 14)
		# Le texte se place à droite du pictogramme.
		for box_name: StringName in [&"normal", &"hover", &"pressed", &"disabled"]:
			var box: StyleBox = button.get_theme_stylebox(box_name)
			box.content_margin_left = 12.0 + BuildingButton.ICON_SPACE
		button.ink = ink
		button.queue_redraw()


## Bouton d'un bâtiment : pastille avec le pictogramme à gauche et le texte (prix ou palier).
class BuildingButton:
	extends Button

	## Place réservée au pictogramme, à gauche du texte, en pixels.
	const ICON_SPACE: float = 34.0

	var kind: int = BuildingDef.Kind.SWARMER
	var ink: Color = Color.BLACK

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		alignment = HORIZONTAL_ALIGNMENT_RIGHT
		theme_type_variation = &"SmallButton"

	func _draw() -> void:
		var height: float = size.y
		var center := Vector2(12.0 + ICON_SPACE * 0.5, height * 0.5)
		HudIcons.draw_building(self, kind, center, height * 0.62, ink)
