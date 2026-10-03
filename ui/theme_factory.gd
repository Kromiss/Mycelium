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
	return theme


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
