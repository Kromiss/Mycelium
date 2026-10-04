class_name BuildingButton
extends Button
## Bouton d'un bâtiment, pour la palette et le menu rond (GDD §7.4, §13.6) : pictogramme dans
## son disque, coût dessous, touche de raccourci en coin ; cadenas s'il n'est pas débloqué,
## coût en couleur d'alerte s'il est trop cher.

## Rayon du disque, en pixels.
const DISC_RADIUS: float = 24.0
const FONT_SIZE: int = 16

var building: SimBuilding
var dark: Color = Color.BLACK
## Texte de la touche de raccourci (vide : aucune).
var key_text: String = ""
var cost_text: String = ""
var locked: bool = false
var affordable: bool = true


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	theme_type_variation = &"SmallButton"
	custom_minimum_size = Vector2(88.0, 92.0)
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS


## Change ce que montre le bouton.
func show_state(new_cost: String, is_locked: bool, is_affordable: bool, tooltip: String) -> void:
	cost_text = new_cost
	locked = is_locked
	affordable = is_affordable
	tooltip_text = tooltip
	queue_redraw()


func _draw() -> void:
	if building == null:
		return
	var palette: Palette = Settings.palette()
	var center := Vector2(size.x * 0.5, 12.0 + DISC_RADIUS)
	if locked:
		BuildingIcons.draw_off(self, building.id, center, DISC_RADIUS, palette)
	else:
		BuildingIcons.draw_built(self, building.id, center, DISC_RADIUS, dark, palette)
	var font: Font = get_theme_font(&"font", &"Label")
	var color: Color = palette.text if affordable or locked else palette.warning
	if locked:
		color = palette.text_secondary
	var baseline := Vector2(0.0, center.y + DISC_RADIUS + 22.0)
	draw_string(font, baseline, cost_text, HORIZONTAL_ALIGNMENT_CENTER, size.x, FONT_SIZE, color)
	if key_text != "":
		draw_string(
			font,
			Vector2(8.0, 20.0),
			key_text,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			FONT_SIZE - 2,
			palette.text_secondary
		)
