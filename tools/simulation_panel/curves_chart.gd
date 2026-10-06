class_name CurvesChart
extends Control
## Courbes par minute du panneau de simulations (GDD §18.5), une par série et par secteur :
## production en échelle logarithmique, ou cases en échelle linéaire. La légende est dessinée
## sous les courbes.

const COLORS: ColonyColors = preload("res://data/colors.tres")
## Ordre des couleurs des courbes, pour que deux courbes voisines restent bien distinctes.
const COLOR_ORDER: Array[int] = [2, 11, 10, 0, 5, 9, 6, 4, 7, 3, 1, 8]
const LEGEND_LINE: float = 26.0
const LEGEND_COLUMNS: int = 2
const MARGIN: float = 8.0
## Nombre de graduations de l'échelle linéaire.
const LINEAR_STEPS: int = 4

var _curves: Array[PackedFloat64Array] = []
var _labels: PackedStringArray = PackedStringArray()
var _logarithmic: bool = true


## Courbes à tracer (une valeur par minute, −1 : pas de valeur), leurs noms et l'échelle.
func set_curves(
	curves: Array[PackedFloat64Array], labels: PackedStringArray, logarithmic: bool = true
) -> void:
	_curves = curves
	_labels = labels
	_logarithmic = logarithmic
	custom_minimum_size.y = 300.0 + LEGEND_LINE * ceilf(_labels.size() / float(LEGEND_COLUMNS))
	queue_redraw()


## Couleur de la courbe numéro « index ».
static func series_color(index: int) -> Color:
	return COLORS.main[COLOR_ORDER[index % COLOR_ORDER.size()]]


func _draw() -> void:
	var palette: Palette = Settings.palette()
	var legend_height: float = LEGEND_LINE * ceilf(_labels.size() / float(LEGEND_COLUMNS))
	var area := Rect2(Vector2.ZERO, Vector2(size.x, maxf(10.0, size.y - legend_height - MARGIN)))
	draw_rect(area, palette.background)
	var peak: float = 1.0
	var minutes: int = 1
	for curve: PackedFloat64Array in _curves:
		minutes = maxi(minutes, curve.size())
		for value: float in curve:
			peak = maxf(peak, value)
	var top: float = _draw_grid(area, peak, palette)
	for index: int in range(_curves.size()):
		var points := PackedVector2Array()
		var curve: PackedFloat64Array = _curves[index]
		for minute: int in range(curve.size()):
			if curve[minute] < 0.0:
				continue
			var x: float = area.size.x * (float(minute) + 0.5) / float(minutes)
			points.append(Vector2(x, area.size.y * (1.0 - _height(curve[minute], top))))
		if points.size() >= 2:
			draw_polyline(points, series_color(index), 3.0, true)
	_draw_legend(area, palette)


## Lignes de l'échelle ; renvoie le haut de l'échelle (décades en log, valeur en linéaire).
func _draw_grid(area: Rect2, peak: float, palette: Palette) -> float:
	var font: Font = get_theme_default_font()
	var top: float = 0.0
	var marks: Array[float] = []
	var texts: Array[String] = []
	if _logarithmic:
		top = maxf(3.0, ceilf(log(peak) / log(10.0) + 0.001))
		for decade: int in range(1, int(top)):
			marks.append(float(decade) / top)
			texts.append("1e%d" % decade)
	else:
		top = maxf(1.0, peak)
		for step: int in range(1, LINEAR_STEPS):
			marks.append(float(step) / LINEAR_STEPS)
			texts.append(str(roundi(top * step / LINEAR_STEPS)))
	for i: int in range(marks.size()):
		var y: float = area.size.y * (1.0 - marks[i])
		draw_line(Vector2(0.0, y), Vector2(area.size.x, y), palette.line, 1.0)
		draw_string(
			font,
			Vector2(4.0, y - 4.0),
			texts[i],
			HORIZONTAL_ALIGNMENT_LEFT,
			-1,
			14,
			palette.text_secondary
		)
	return top


## Hauteur relative (0 à 1) d'une valeur.
func _height(value: float, top: float) -> float:
	if _logarithmic:
		return clampf(log(maxf(1.0, value)) / log(10.0) / top, 0.0, 1.0)
	return clampf(value / top, 0.0, 1.0)


func _draw_legend(area: Rect2, palette: Palette) -> void:
	var font: Font = get_theme_default_font()
	var width: float = size.x / LEGEND_COLUMNS
	for index: int in range(_labels.size()):
		var column: float = width * (index % LEGEND_COLUMNS)
		@warning_ignore("integer_division")
		var row: int = index / LEGEND_COLUMNS
		var y: float = area.size.y + MARGIN + LEGEND_LINE * row
		draw_rect(Rect2(column, y + 6.0, 18.0, 10.0), series_color(index))
		draw_string(
			font,
			Vector2(column + 26.0, y + 17.0),
			_labels[index],
			HORIZONTAL_ALIGNMENT_LEFT,
			width - 30.0,
			ThemeFactory.SMALL_SIZE,
			palette.text
		)
