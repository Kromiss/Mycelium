class_name CurvesChart
extends Control
## Courbes de production par minute, une par série, en échelle logarithmique (panneau de
## simulations, GDD §14.5). La légende est dessinée sous les courbes.

const COLORS: ColonyColors = preload("res://data/colors.tres")
## Ordre des couleurs des séries, pour que deux séries voisines restent bien distinctes.
const COLOR_ORDER: Array[int] = [2, 11, 10, 0, 5, 9, 6, 4, 7, 3, 1, 8]
const LEGEND_LINE: float = 26.0
const MARGIN: float = 8.0

var _curves: Array[PackedFloat64Array] = []
var _labels: PackedStringArray = PackedStringArray()


## Courbes à tracer (nutriments par seconde, une valeur par minute) et leurs noms.
func set_curves(curves: Array[PackedFloat64Array], labels: PackedStringArray) -> void:
	_curves = curves
	_labels = labels
	queue_redraw()


## Couleur de la série numéro « index ».
static func series_color(index: int) -> Color:
	return COLORS.main[COLOR_ORDER[index % COLOR_ORDER.size()]]


func _draw() -> void:
	var palette: Palette = Settings.palette()
	var font: Font = get_theme_default_font()
	var font_size: int = ThemeFactory.SMALL_SIZE
	var legend_height: float = LEGEND_LINE * ceilf(_labels.size() / 3.0)
	var area := Rect2(Vector2.ZERO, Vector2(size.x, maxf(10.0, size.y - legend_height - MARGIN)))
	draw_rect(area, palette.background)
	var peak: float = 1.0
	var minutes: int = 1
	for curve: PackedFloat64Array in _curves:
		minutes = maxi(minutes, curve.size())
		for value: float in curve:
			peak = maxf(peak, value)
	var top: int = maxi(3, ceili(log(peak) / log(10.0) + 0.001))
	for decade: int in range(1, top):
		var y: float = area.size.y * (1.0 - float(decade) / float(top))
		draw_line(Vector2(0.0, y), Vector2(area.size.x, y), palette.line, 1.0)
		draw_string(
			font,
			Vector2(4.0, y - 4.0),
			"1e%d" % decade,
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			14,
			palette.text_secondary
		)
	for index: int in range(_curves.size()):
		var points := PackedVector2Array()
		var curve: PackedFloat64Array = _curves[index]
		for minute: int in range(curve.size()):
			if curve[minute] < 0.0:
				continue
			var x: float = area.size.x * (float(minute) + 0.5) / float(minutes)
			var height: float = clampf(log(maxf(1.0, curve[minute])) / log(10.0) / top, 0.0, 1.0)
			points.append(Vector2(x, area.size.y * (1.0 - height)))
		if points.size() >= 2:
			draw_polyline(points, series_color(index), 3.0, true)
	for index: int in range(_labels.size()):
		var column: float = size.x / 3.0 * (index % 3)
		@warning_ignore("integer_division")
		var row: int = index / 3
		var y: float = area.size.y + MARGIN + LEGEND_LINE * row
		draw_rect(Rect2(column, y + 6.0, 18.0, 10.0), series_color(index))
		draw_string(
			font,
			Vector2(column + 26.0, y + 17.0),
			_labels[index],
			HORIZONTAL_ALIGNMENT_LEFT,
			size.x / 3.0 - 30.0,
			font_size,
			palette.text
		)
