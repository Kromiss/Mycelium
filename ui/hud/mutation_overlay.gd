class_name MutationOverlay
extends Control
## Choix d'une mutation (maquette « Choisir une mutation ») : la carte s'assombrit ; bandeau
## « Palier N · production ×M · +E Enzymes », titre, rappel que la partie continue, et trois
## cartes (pictogramme, nom, effet, touche 1 à 3). Un bouton œil cache les cartes pour voir la
## carte ; le panneau permet de les rouvrir (décidé le 4 octobre 2026).

## Le joueur a choisi la carte « choice » (0 à 2).
signal chosen(choice: int)
## Le joueur a caché les cartes (bouton œil).
signal hide_requested

## Actions des touches des cartes, dans l'ordre.
const ACTIONS: Array[StringName] = [&"mutation_1", &"mutation_2", &"mutation_3"]

var eye_button: Button

var _session: Session
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _scrim: ColorRect
var _banner: Label
var _title: Label
var _subtitle: Label
var _cards: Array[Button] = []
var _names: Array[Label] = []
var _texts: Array[Label] = []
var _keys: Array[Label] = []


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_scrim = ColorRect.new()
	_scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_scrim)
	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_TOP_WIDE)
	column.offset_left = 60.0
	column.offset_right = -60.0
	column.offset_top = 200.0
	column.add_theme_constant_override(&"separation", 18)
	add_child(column)
	var banner_center := CenterContainer.new()
	column.add_child(banner_center)
	_banner = HudStyle.label(&"BoldLabel")
	banner_center.add_child(_banner)
	_title = HudStyle.label(&"BannerLabel", "MUTATION_TITLE")
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override(&"font_size", 57)
	column.add_child(_title)
	_subtitle = HudStyle.label(&"BodyLabel", "MUTATION_SUBTITLE")
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_subtitle)
	var cards := HBoxContainer.new()
	cards.add_theme_constant_override(&"separation", 24)
	column.add_child(cards)
	for choice: int in range(ACTIONS.size()):
		cards.add_child(_card(choice))
	eye_button = Button.new()
	eye_button.focus_mode = Control.FOCUS_NONE
	eye_button.tooltip_text = "MUTATION_HIDE"
	eye_button.custom_minimum_size = Vector2(72.0, 72.0)
	eye_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	eye_button.offset_left = -96.0
	eye_button.offset_right = -24.0
	eye_button.offset_top = 200.0
	eye_button.offset_bottom = 272.0
	eye_button.pressed.connect(func() -> void: hide_requested.emit())
	eye_button.draw.connect(_draw_eye)
	add_child(eye_button)


## Branche les cartes sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	_main = main
	_dark = dark
	apply_palette(Settings.palette())


## Couleurs du thème (voile, cartes, textes).
func apply_palette(palette: Palette) -> void:
	_scrim.color = palette.scrim
	_title.add_theme_color_override(&"font_color", palette.scrim_text)
	_subtitle.add_theme_color_override(&"font_color", palette.scrim_text)
	_banner.add_theme_color_override(&"font_color", Color.WHITE)
	_banner.add_theme_stylebox_override(&"normal", HudStyle.pill(_dark, _dark, 0, 21, 6))
	HudStyle.paint_button(eye_button, palette.card, palette.line, palette.text, 0)
	for card: Button in _cards:
		HudStyle.paint_button(card, palette.card, palette.line, palette.text, 24)
		for state: StringName in [&"normal", &"hover", &"pressed"]:
			var box: StyleBoxFlat = card.get_theme_stylebox(state)
			box.set_corner_radius_all(39)
			box.content_margin_top = 33
			box.content_margin_bottom = 33
	for key: Label in _keys:
		key.add_theme_color_override(&"font_color", _dark)


## Montre le premier choix en attente de la colonie du joueur.
func show_offer() -> void:
	var state: GameState = _session.simulation.state
	var defs: SimDefs = state.defs
	var colony: ColonyState = _session.colony()
	if colony.pending_offers.is_empty():
		visible = false
		return
	var tier: int = colony.pending_tiers[0] if not colony.pending_tiers.is_empty() else colony.tier
	_banner.text = (
		tr("MUTATION_BANNER")
		% [
			tier,
			NumberFormat.multiplier(ColonyStats.tier_production_pm(defs, tier)),
			NumberFormat.amount(ColonyStats.tier_enzymes(defs, colony, tier)),
		]
	)
	for choice: int in range(_cards.size()):
		var index: int = colony.pending_offers[choice] if choice < defs.mutation_choices else -1
		_cards[choice].visible = index >= 0
		if index < 0:
			continue
		var mutation: SimMutation = defs.mutations[index]
		_names[choice].text = mutation.name_key
		_texts[choice].text = mutation.desc_key
		_keys[choice].text = tr("MUTATION_KEY") % ControlsText.action_key(ACTIONS[choice])
	visible = true


## Carte d'un choix (pour les tests).
func card(choice: int) -> Button:
	return _cards[choice]


func _card(choice: int) -> Button:
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.custom_minimum_size = Vector2(0.0, 360.0)
	button.pressed.connect(func() -> void: chosen.emit(choice))
	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_FULL_RECT)
	column.offset_left = 18.0
	column.offset_right = -18.0
	column.offset_top = 33.0
	column.offset_bottom = -24.0
	column.alignment = BoxContainer.ALIGNMENT_BEGIN
	column.add_theme_constant_override(&"separation", 15)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(column)
	var icon := Control.new()
	icon.custom_minimum_size = Vector2(90.0, 90.0)
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	icon.draw.connect(func() -> void: _draw_icon(icon))
	column.add_child(icon)
	var name: Label = HudStyle.label(&"CardTitleLabel")
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(name)
	var text: Label = HudStyle.label(&"BodyHintLabel")
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(text)
	var key: Label = HudStyle.label(&"BoldLabel")
	key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(key)
	_cards.append(button)
	_names.append(name)
	_texts.append(text)
	_keys.append(key)
	return button


## Pictogramme d'une carte : un petit champignon sur une pastille pâle de la couleur du joueur.
func _draw_icon(icon: Control) -> void:
	var center: Vector2 = icon.size * 0.5
	icon.draw_circle(center, 45.0, HudStyle.pale(_main, Settings.palette()))
	TurretArt.draw_mushroom(icon, center, 60.0, 1, _dark, _main, TurretArt.INK)


func _draw_eye() -> void:
	HudIcons.draw_eye(eye_button, eye_button.size * 0.5, 42.0, Settings.palette().text)
