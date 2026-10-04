class_name MutationsCard
extends PanelContainer
## « Mes mutations » (maquette « Choisir une mutation », panneau de droite) : une pastille par
## mutation prise (nom ; palier et effet dans l'info-bulle), au-dessus des améliorations.
## Quand les cartes de mutation ont été cachées (bouton œil), un bouton les rouvre (décidé le
## 4 octobre 2026).

## Le joueur veut revoir les cartes du choix en attente.
signal reopen_requested

var reopen_button: Button

var _session: Session
var _list: HFlowContainer
var _main: Color = Color.WHITE
var _empty: Label


func _init() -> void:
	theme_type_variation = &"GameCard"
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 6)
	add_child(column)
	column.add_child(HudStyle.label(&"TinyBoldHintLabel", "HUD_MUTATIONS"))
	reopen_button = EyeButton.new()
	reopen_button.pressed.connect(func() -> void: reopen_requested.emit())
	column.add_child(reopen_button)
	_empty = HudStyle.label(&"BodyHintLabel", "HUD_NO_MUTATION")
	column.add_child(_empty)
	_list = HFlowContainer.new()
	_list.add_theme_constant_override(&"h_separation", 8)
	_list.add_theme_constant_override(&"v_separation", 8)
	column.add_child(_list)


## Branche la carte sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	_main = main
	HudStyle.paint_button(reopen_button, dark, dark, Color.WHITE)
	# Place pour l'œil à gauche du texte.
	for state: StringName in [&"normal", &"hover", &"pressed", &"disabled"]:
		var box: StyleBox = reopen_button.get_theme_stylebox(state)
		box.content_margin_left = 64.0
	refresh(false)


## Met à jour la liste ; « offer_hidden » : un choix attend et ses cartes sont cachées.
func refresh(offer_hidden: bool) -> void:
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = _session.simulation.state.defs
	var waiting: int = colony.pending_choice_count(defs.mutation_choices)
	reopen_button.visible = offer_hidden and waiting > 0
	reopen_button.text = tr("HUD_CHOOSE_MUTATION") % waiting
	for child: Node in _list.get_children():
		child.queue_free()
	_empty.visible = colony.mutations.is_empty()
	for i: int in range(colony.mutations.size()):
		var mutation: SimMutation = defs.mutations[colony.mutations[i]]
		var tier: int = colony.mutation_tiers[i] if i < colony.mutation_tiers.size() else 0
		var pill: Label = HudStyle.label(&"BoldLabel", mutation.name_key)
		pill.mouse_filter = Control.MOUSE_FILTER_STOP
		pill.tooltip_text = (
			tr("HUD_MUTATION_ENTRY") % [tier, tr(mutation.name_key), tr(mutation.desc_key)]
		)
		var pale: Color = HudStyle.pale(_main, Settings.palette())
		pill.add_theme_stylebox_override(&"normal", HudStyle.pill(pale, pale, 0, 15, 4))
		_list.add_child(pill)


## Bouton avec un œil dessiné à gauche du texte.
class EyeButton:
	extends Button

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		custom_minimum_size = Vector2(0.0, 54.0)
		alignment = HORIZONTAL_ALIGNMENT_LEFT
		add_theme_font_override(&"font", ThemeFactory.bold_font())
		add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
		add_theme_constant_override(&"h_separation", 0)

	func _draw() -> void:
		var ink: Color = get_theme_color(&"font_color")
		HudIcons.draw_eye(self, Vector2(34.0, size.y * 0.5), 36.0, ink)
