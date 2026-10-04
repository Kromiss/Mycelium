class_name AbilityBar
extends PanelContainer
## Capacités (maquette « Écran de partie », en bas du panneau) : un bouton rond par capacité,
## avec son anneau de recharge, son nom, et son état (prête, coût et touche ; recharge ;
## palier requis ; protection de départ ; active).

## Le joueur a cliqué sur une capacité (rang dans SimDefs.abilities).
signal ability_pressed(index: int)

## Taille du texte d'état (16,5 px sur la maquette à l'échelle 1920 × 1080).
const STATE_SIZE: int = 16
## Actions des touches des capacités, dans l'ordre des boutons.
const ACTIONS: Array[StringName] = [&"ability_1", &"ability_2", &"ability_3"]

var _session: Session
var _dark: Color = Color.BLACK
var _buttons: Array[AbilityButton] = []
var _states: Array[Label] = []
var _row: HBoxContainer


func _init() -> void:
	theme_type_variation = &"GameCard"
	_row = HBoxContainer.new()
	_row.add_theme_constant_override(&"separation", 12)
	add_child(_row)


## Branche la barre sur une partie, avec la teinte foncée de la colonie du joueur.
func setup(session: Session, dark: Color) -> void:
	_session = session
	_dark = dark
	var defs: SimDefs = session.simulation.state.defs
	for index: int in range(defs.abilities.size()):
		var item := HBoxContainer.new()
		item.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		item.add_theme_constant_override(&"separation", 12)
		var button := AbilityButton.new()
		button.kind = defs.abilities[index].kind
		button.pressed.connect(func() -> void: ability_pressed.emit(index))
		item.add_child(button)
		var texts := VBoxContainer.new()
		texts.alignment = BoxContainer.ALIGNMENT_CENTER
		texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		texts.add_theme_constant_override(&"separation", 0)
		var name: Label = HudStyle.label(&"BoldLabel", defs.abilities[index].name_key)
		name.clip_text = true
		name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		texts.add_child(name)
		var state: Label = HudStyle.label(&"TinyHintLabel")
		state.add_theme_font_size_override(&"font_size", STATE_SIZE)
		state.clip_text = true
		state.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		texts.add_child(state)
		item.add_child(texts)
		_row.add_child(item)
		_buttons.append(button)
		_states.append(state)
	refresh()


## Bouton d'une capacité (pour les tests).
func button(index: int) -> AbilityButton:
	return _buttons[index]


## Texte d'état d'une capacité (pour les tests).
func state_text(index: int) -> String:
	return _states[index].text


## Met à jour les anneaux et les états.
func refresh() -> void:
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var palette: Palette = Settings.palette()
	for index: int in range(_buttons.size()):
		var ability: SimAbility = state.defs.abilities[index]
		var key: String = ControlsText.action_key(ACTIONS[index]) if index < ACTIONS.size() else ""
		var waiting: int = colony.ability_ready[index] - state.tick
		var ready: bool = (
			colony.tier >= ability.unlock_tier and state.protection_over() and waiting <= 0
		)
		var text: String
		if colony.tier < ability.unlock_tier:
			text = tr("ABILITY_LOCKED") % [ability.unlock_tier, key]
		elif not state.protection_over():
			text = tr("ABILITY_PROTECTED") % key
		elif waiting > 0:
			text = tr("ABILITY_COOLDOWN") % [NumberFormat.clock(waiting), key]
		elif colony.enzymes < Fixed.from_units(ability.cost_enzymes):
			text = tr("ABILITY_NO_ENZYMES") % [ability.cost_enzymes, key]
			ready = false
		else:
			text = tr("ABILITY_READY") % [ability.cost_enzymes, key]
		_states[index].text = text
		var button: AbilityButton = _buttons[index]
		button.progress = 1.0
		if waiting > 0 and ability.cooldown_ticks > 0:
			button.progress = 1.0 - float(waiting) / float(ability.cooldown_ticks)
		button.ring_color = _dark if colony.tier >= ability.unlock_tier else palette.line
		button.ink = _dark if ready else palette.text_secondary
		button.queue_redraw()


## Bouton rond d'une capacité : anneau de recharge (rempli de la couleur de la colonie quand
## elle est prête) et pictogramme.
class AbilityButton:
	extends Button

	var kind: int = AbilityDef.Kind.SALVO
	var progress: float = 1.0
	var ring_color: Color = Color.BLACK
	var ink: Color = Color.BLACK

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		flat = true
		custom_minimum_size = Vector2(63.0, 63.0)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for state: StringName in [&"normal", &"hover", &"pressed", &"disabled", &"focus"]:
			add_theme_stylebox_override(state, StyleBoxEmpty.new())

	func _draw() -> void:
		var palette: Palette = Settings.palette()
		var center: Vector2 = size * 0.5
		var outer: float = minf(size.x, size.y) * 0.5
		draw_circle(center, outer, palette.line)
		var sweep: float = TAU * clampf(progress, 0.0, 1.0)
		draw_arc(center, outer - 3.0, -PI / 2.0, -PI / 2.0 + sweep, 48, ring_color, 6.0, true)
		var disc: Color = palette.card_hover() if is_hovered() else palette.card
		draw_circle(center, outer - 6.0, disc)
		HudIcons.draw_ability(self, kind, center, outer * 0.9, ink)
