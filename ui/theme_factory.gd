class_name ThemeFactory
extends RefCounted
## Construit le thème de l'interface (polices, boutons, listes) à partir d'une palette.
## Un seul code pour les deux thèmes : seules les couleurs changent.

const FREDOKA: FontFile = preload("res://assets/fonts/Fredoka.ttf")
const NUNITO: FontFile = preload("res://assets/fonts/Nunito.ttf")

## Tailles de police, pour un écran de référence de 1920×1080.
const TEXT_SIZE: int = 24
const HEADER_SIZE: int = 34
const TITLE_SIZE: int = 72
## Graisses (axe « wght » des polices variables).
const TEXT_WEIGHT: int = 600
const TITLE_WEIGHT: int = 600
## Arrondi des boutons : très grand pour obtenir des pastilles.
const PILL_RADIUS: int = 999
const CARD_RADIUS: int = 28
## Taille des petits textes du HUD (libellés des réglages, info-bulles).
const SMALL_SIZE: int = 20
## Taille des grands chiffres du HUD (nutriments).
const BIG_NUMBER_SIZE: int = 44
## Écran de partie (maquettes G3, ×1,5 depuis 1280×760) : très petits textes, textes des
## lignes, titres des cartes, horloge, et graisse des textes appuyés.
const TINY_SIZE: int = 18
const BODY_SIZE: int = 21
const CARD_TITLE_SIZE: int = 30
const CLOCK_SIZE: int = 32
const BOLD_WEIGHT: int = 800
## Arrondi et marges des cartes de l'écran de partie.
const GAME_CARD_RADIUS: int = 30


## Thème complet pour une palette.
static func build(palette: Palette) -> Theme:
	var theme := Theme.new()
	theme.default_font = _font(NUNITO, TEXT_WEIGHT)
	theme.default_font_size = TEXT_SIZE
	_add_labels(theme, palette)
	_add_buttons(theme, palette, &"Button")
	_add_buttons(theme, palette, &"OptionButton")
	_add_popup(theme, palette)
	_add_panel(theme, palette)
	_add_inputs(theme, palette)
	_add_hud(theme, palette)
	_add_game_screen(theme, palette)
	_add_tabs(theme, palette)
	return theme


## Police des titres (Fredoka, graisse des titres), pour les textes dessinés sur la carte.
static func title_font() -> FontVariation:
	return _font(FREDOKA, TITLE_WEIGHT)


## Police des textes appuyés (Nunito, graisse forte).
static func bold_font() -> FontVariation:
	return _font(NUNITO, BOLD_WEIGHT)


static func _font(file: FontFile, weight: int) -> FontVariation:
	var font := FontVariation.new()
	font.base_font = file
	font.variation_opentype = {
		TextServerManager.get_primary_interface().name_to_tag("wght"): weight
	}
	return font


static func _add_labels(theme: Theme, palette: Palette) -> void:
	theme.set_color(&"font_color", &"Label", palette.text)
	# Titre du jeu.
	theme.set_type_variation(&"TitleLabel", &"Label")
	theme.set_font(&"font", &"TitleLabel", _font(FREDOKA, TITLE_WEIGHT))
	theme.set_font_size(&"font_size", &"TitleLabel", TITLE_SIZE)
	# Titres de section.
	theme.set_type_variation(&"HeaderLabel", &"Label")
	theme.set_font(&"font", &"HeaderLabel", _font(FREDOKA, TITLE_WEIGHT))
	theme.set_font_size(&"font_size", &"HeaderLabel", HEADER_SIZE)
	# Textes discrets (aides, numéro de version).
	theme.set_type_variation(&"HintLabel", &"Label")
	theme.set_color(&"font_color", &"HintLabel", palette.text_secondary)


static func _add_buttons(theme: Theme, palette: Palette, type: StringName) -> void:
	theme.set_stylebox(&"normal", type, _pill(palette.card, palette.line))
	theme.set_stylebox(&"hover", type, _pill(palette.card_hover(), palette.line))
	theme.set_stylebox(&"pressed", type, _pill(palette.card_pressed(), palette.line))
	theme.set_stylebox(&"focus", type, _pill(Color.TRANSPARENT, palette.text_secondary))
	var disabled_color: Color = palette.card
	disabled_color.a = 0.5
	theme.set_stylebox(&"disabled", type, _pill(disabled_color, palette.line))
	for state: StringName in [
		&"font_color",
		&"font_hover_color",
		&"font_pressed_color",
		&"font_focus_color",
		&"font_hover_pressed_color"
	]:
		theme.set_color(state, type, palette.text)
	theme.set_color(&"font_disabled_color", type, palette.text_secondary)
	# Flèche des listes déroulantes, écartée du bord arrondi.
	theme.set_constant(&"arrow_margin", type, 28)


static func _add_popup(theme: Theme, palette: Palette) -> void:
	var panel := StyleBoxFlat.new()
	panel.bg_color = palette.card
	panel.border_color = palette.line
	panel.set_border_width_all(2)
	panel.set_corner_radius_all(16)
	panel.set_content_margin_all(8)
	theme.set_stylebox(&"panel", &"PopupMenu", panel)
	var hover := StyleBoxFlat.new()
	hover.bg_color = palette.card_hover()
	hover.set_corner_radius_all(12)
	theme.set_stylebox(&"hover", &"PopupMenu", hover)
	theme.set_color(&"font_color", &"PopupMenu", palette.text)
	theme.set_color(&"font_hover_color", &"PopupMenu", palette.text)


static func _add_panel(theme: Theme, palette: Palette) -> void:
	var card := StyleBoxFlat.new()
	card.bg_color = palette.card
	card.border_color = palette.line
	card.set_border_width_all(2)
	card.set_corner_radius_all(CARD_RADIUS)
	card.set_content_margin_all(40)
	theme.set_stylebox(&"panel", &"PanelContainer", card)


static func _add_inputs(theme: Theme, palette: Palette) -> void:
	for state: StringName in [&"normal", &"read_only"]:
		theme.set_stylebox(state, &"LineEdit", _field(palette.background, palette.line))
	theme.set_stylebox(&"focus", &"LineEdit", _field(Color.TRANSPARENT, palette.text_secondary))
	theme.set_color(&"font_color", &"LineEdit", palette.text)
	theme.set_color(&"font_uneditable_color", &"LineEdit", palette.text_secondary)
	theme.set_color(&"caret_color", &"LineEdit", palette.text)
	theme.set_color(&"selection_color", &"LineEdit", palette.line)
	# Barre de progression (prochain palier).
	var track := StyleBoxFlat.new()
	track.bg_color = palette.line
	track.set_corner_radius_all(PILL_RADIUS)
	track.content_margin_top = 7
	track.content_margin_bottom = 7
	theme.set_stylebox(&"background", &"ProgressBar", track)
	var fill := StyleBoxFlat.new()
	fill.bg_color = palette.text_secondary
	fill.set_corner_radius_all(PILL_RADIUS)
	theme.set_stylebox(&"fill", &"ProgressBar", fill)
	theme.set_color(&"font_color", &"ProgressBar", palette.text)


static func _add_hud(theme: Theme, palette: Palette) -> void:
	# Petits boutons du HUD (pause, vitesse, récapitulatif).
	theme.set_type_variation(&"SmallButton", &"Button")
	var small: StyleBoxFlat = _pill(palette.card, palette.line)
	small.content_margin_left = 18
	small.content_margin_right = 18
	small.content_margin_top = 6
	small.content_margin_bottom = 6
	theme.set_stylebox(&"normal", &"SmallButton", small)
	var small_hover: StyleBoxFlat = small.duplicate()
	small_hover.bg_color = palette.card_hover()
	theme.set_stylebox(&"hover", &"SmallButton", small_hover)
	var small_pressed: StyleBoxFlat = small.duplicate()
	small_pressed.bg_color = palette.card_pressed()
	theme.set_stylebox(&"pressed", &"SmallButton", small_pressed)
	theme.set_font_size(&"font_size", &"SmallButton", SMALL_SIZE)
	# Panneaux du HUD : cartes plus serrées que celles des écrans de menu.
	theme.set_type_variation(&"HudPanel", &"PanelContainer")
	var hud: StyleBoxFlat = _card(palette, 20)
	theme.set_stylebox(&"panel", &"HudPanel", hud)
	# Info-bulles et messages.
	theme.set_type_variation(&"TipPanel", &"PanelContainer")
	var tip: StyleBoxFlat = _card(palette, 14)
	tip.set_corner_radius_all(16)
	theme.set_stylebox(&"panel", &"TipPanel", tip)
	theme.set_type_variation(&"SmallLabel", &"Label")
	theme.set_font_size(&"font_size", &"SmallLabel", SMALL_SIZE)
	theme.set_type_variation(&"SmallHintLabel", &"Label")
	theme.set_font_size(&"font_size", &"SmallHintLabel", SMALL_SIZE)
	theme.set_color(&"font_color", &"SmallHintLabel", palette.text_secondary)
	theme.set_type_variation(&"BigNumberLabel", &"Label")
	theme.set_font(&"font", &"BigNumberLabel", _font(FREDOKA, TITLE_WEIGHT))
	theme.set_font_size(&"font_size", &"BigNumberLabel", BIG_NUMBER_SIZE)
	theme.set_type_variation(&"BannerLabel", &"Label")
	theme.set_font(&"font", &"BannerLabel", _font(FREDOKA, TITLE_WEIGHT))
	theme.set_font_size(&"font_size", &"BannerLabel", TITLE_SIZE)


## Écran de partie (maquettes G3) : panneau de droite, cartes sans bordure, textes.
static func _add_game_screen(theme: Theme, palette: Palette) -> void:
	theme.set_type_variation(&"GameCard", &"PanelContainer")
	var card := StyleBoxFlat.new()
	card.bg_color = palette.card
	card.set_corner_radius_all(GAME_CARD_RADIUS)
	card.content_margin_left = 24
	card.content_margin_right = 24
	card.content_margin_top = 15
	card.content_margin_bottom = 15
	theme.set_stylebox(&"panel", &"GameCard", card)
	theme.set_type_variation(&"GamePanel", &"PanelContainer")
	var panel := StyleBoxFlat.new()
	panel.bg_color = palette.panel
	panel.border_color = palette.line
	panel.border_width_left = 3
	panel.content_margin_left = 24
	panel.content_margin_right = 24
	panel.content_margin_top = 18
	panel.content_margin_bottom = 18
	theme.set_stylebox(&"panel", &"GamePanel", panel)
	var labels: Array[Array] = [
		[&"TinyHintLabel", NUNITO, TEXT_WEIGHT, TINY_SIZE, palette.text_secondary],
		[&"TinyBoldHintLabel", NUNITO, BOLD_WEIGHT, TINY_SIZE, palette.text_secondary],
		[&"BodyLabel", NUNITO, TEXT_WEIGHT, BODY_SIZE, palette.text],
		[&"BodyHintLabel", NUNITO, TEXT_WEIGHT, BODY_SIZE, palette.text_secondary],
		[&"BoldLabel", NUNITO, BOLD_WEIGHT, BODY_SIZE, palette.text],
		[&"StatLabel", NUNITO, BOLD_WEIGHT, TEXT_SIZE, palette.text],
		[&"CardTitleLabel", FREDOKA, TITLE_WEIGHT, CARD_TITLE_SIZE, palette.text],
		[&"ClockLabel", FREDOKA, TITLE_WEIGHT, CLOCK_SIZE, palette.text],
	]
	for entry: Array in labels:
		var type: StringName = entry[0]
		var file: FontFile = entry[1]
		var weight: int = entry[2]
		var size: int = entry[3]
		var color: Color = entry[4]
		theme.set_type_variation(type, &"Label")
		theme.set_font(&"font", type, _font(file, weight))
		theme.set_font_size(&"font_size", type, size)
		theme.set_color(&"font_color", type, color)


static func _add_tabs(theme: Theme, palette: Palette) -> void:
	theme.set_stylebox(&"panel", &"TabContainer", _card(palette, 20))
	var selected: StyleBoxFlat = _pill(palette.card, palette.text_secondary)
	var unselected: StyleBoxFlat = _pill(palette.background, palette.line)
	var hovered: StyleBoxFlat = _pill(palette.card_hover(), palette.line)
	for box: StyleBoxFlat in [selected, unselected, hovered]:
		box.content_margin_top = 8
		box.content_margin_bottom = 8
	theme.set_stylebox(&"tab_selected", &"TabContainer", selected)
	theme.set_stylebox(&"tab_unselected", &"TabContainer", unselected)
	theme.set_stylebox(&"tab_hovered", &"TabContainer", hovered)
	theme.set_stylebox(&"tab_focus", &"TabContainer", StyleBoxEmpty.new())
	theme.set_constant(&"side_margin", &"TabContainer", 0)
	for state: StringName in [&"font_selected_color", &"font_hovered_color"]:
		theme.set_color(state, &"TabContainer", palette.text)
	theme.set_color(&"font_unselected_color", &"TabContainer", palette.text_secondary)
	for state: StringName in [&"font_color", &"font_hover_color", &"font_pressed_color"]:
		theme.set_color(state, &"CheckBox", palette.text)
	for state: StringName in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus"]:
		theme.set_stylebox(state, &"CheckBox", StyleBoxEmpty.new())
	theme.set_color(&"font_color", &"TooltipLabel", palette.text)


## Carte arrondie avec une marge intérieure donnée.
static func _card(palette: Palette, margin: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = palette.card
	box.border_color = palette.line
	box.set_border_width_all(2)
	box.set_corner_radius_all(CARD_RADIUS)
	box.set_content_margin_all(margin)
	return box


## Champ de saisie arrondi.
static func _field(background: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = background
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(14)
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box


## Boîte en forme de pastille (bords entièrement arrondis).
static func _pill(background: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = background
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(PILL_RADIUS)
	box.content_margin_left = 32
	box.content_margin_right = 32
	box.content_margin_top = 12
	box.content_margin_bottom = 12
	return box
