class_name HudStyle
extends RefCounted
## Styles de l'écran de partie qui dépendent de la couleur de la colonie ou de l'état d'un
## bouton (maquettes G3) : pastilles pleines ou en contour, barres, badges. Les couleurs fixes
## viennent du thème (ThemeFactory).

## Teinte pâle d'une couleur de colonie (cases blessées, badges, halos) : mêlée au fond des cartes.
const PALE_MIX: float = 0.6


## Teinte pâle d'une couleur, sur le fond des cartes de la palette.
static func pale(color: Color, palette: Palette) -> Color:
	return color.lerp(palette.card, PALE_MIX)


## Pastille arrondie : fond, bordure (épaisseur en pixels) et marges horizontale et verticale.
static func pill(
	background: Color, border: Color, width: int = 3, margin_x: int = 18, margin_y: int = 6
) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = background
	box.border_color = border
	box.set_border_width_all(width)
	box.set_corner_radius_all(ThemeFactory.PILL_RADIUS)
	box.content_margin_left = margin_x
	box.content_margin_right = margin_x
	box.content_margin_top = margin_y
	box.content_margin_bottom = margin_y
	box.anti_aliasing = true
	return box


## Applique à un bouton un fond, une bordure et une couleur de texte, pour tous ses états.
## Le survol éclaircit légèrement le fond.
static func paint_button(
	button: Button, background: Color, border: Color, ink: Color, margin_x: int = 18
) -> void:
	var normal: StyleBoxFlat = pill(background, border, 3, margin_x)
	var hover: StyleBoxFlat = normal.duplicate()
	hover.bg_color = (
		background.lerp(border, 0.18) if background != border else background.lightened(0.08)
	)
	button.add_theme_stylebox_override(&"normal", normal)
	button.add_theme_stylebox_override(&"hover", hover)
	button.add_theme_stylebox_override(&"pressed", hover)
	button.add_theme_stylebox_override(&"disabled", normal)
	button.add_theme_stylebox_override(&"focus", StyleBoxEmpty.new())
	for state: StringName in [
		&"font_color",
		&"font_hover_color",
		&"font_pressed_color",
		&"font_focus_color",
		&"font_disabled_color",
		&"font_hover_pressed_color",
	]:
		button.add_theme_color_override(state, ink)


## Barre de progression : fond de la palette et remplissage de la couleur donnée.
static func paint_bar(
	bar: ProgressBar, fill_color: Color, palette: Palette, height: int = 12
) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = palette.line
	track.set_corner_radius_all(height)
	track.content_margin_top = height * 0.5
	track.content_margin_bottom = height * 0.5
	var fill := StyleBoxFlat.new()
	fill.bg_color = fill_color
	fill.set_corner_radius_all(height)
	bar.add_theme_stylebox_override(&"background", track)
	bar.add_theme_stylebox_override(&"fill", fill)
	bar.custom_minimum_size.y = height
	bar.show_percentage = false
	bar.max_value = 1.0
	bar.step = 0.0


## Étiquette avec un type de texte du thème (ThemeFactory) et un texte.
static func label(type: StringName, text: String = "") -> Label:
	var node := Label.new()
	node.theme_type_variation = type
	node.text = text
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node
