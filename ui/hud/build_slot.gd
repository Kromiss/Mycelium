class_name BuildSlot
extends Button
## Un bâtiment de la file de construction dans le HUD (GDD §13.6, décidé le 4 octobre 2026) :
## chantier avec sa jauge, ou bâtiment en file avec son numéro ; un clic l'annule.

const DISC_RADIUS: float = 18.0

## Case du bâtiment.
var cell: int = -1
var building_id: StringName = &""
var main: Color = Color.WHITE
var dark: Color = Color.BLACK
## Avancement du chantier (0 à 1), ou −1 pour un bâtiment en file.
var progress: float = -1.0
## Numéro dans la file (0 pour un chantier).
var number: int = 0


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	flat = true
	custom_minimum_size = Vector2(48.0, 48.0)
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


func _draw() -> void:
	var palette: Palette = Settings.palette()
	var center: Vector2 = size * 0.5
	draw_circle(center, DISC_RADIUS + 2.0, main)
	BuildingIcons.draw_planned(self, building_id, center, DISC_RADIUS, dark, palette, progress)
	if number > 0:
		var badge: Vector2 = center + Vector2(DISC_RADIUS * 0.8, -DISC_RADIUS * 0.8)
		draw_circle(badge, 9.0, palette.card)
		draw_arc(badge, 9.0, 0.0, TAU, 20, dark, 1.5, true)
		var font: Font = get_theme_font(&"font", &"Label")
		draw_string(
			font,
			badge + Vector2(-9.0, 5.0),
			str(number),
			HORIZONTAL_ALIGNMENT_CENTER,
			18.0,
			13,
			dark
		)
	if is_hovered():
		draw_arc(center, DISC_RADIUS + 4.0, 0.0, TAU, 32, palette.warning, 2.0, true)
