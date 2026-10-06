class_name ProductionCurve
extends Control
## Courbe de production de la colonie sur toute la partie, en échelle logarithmique
## (décidé le 4 octobre 2026) : on y voit l'explosion du début à la fin.
## L'axe horizontal couvre toute la durée de la partie ; l'axe vertical va de 1 nutriment/s
## à la puissance de 10 au-dessus du record.

var _history: PackedInt64Array = PackedInt64Array()
var _duration: int = 1
var _color: Color = Color.WHITE


## Données à tracer : production à chaque tick (millièmes par seconde) et durée de la partie.
func set_data(history: PackedInt64Array, duration_ticks: int, color: Color) -> void:
	_history = history
	_duration = maxi(1, duration_ticks)
	_color = color
	queue_redraw()


## Hauteur relative (0 en bas, 1 en haut) d'une production sur l'échelle de la courbe.
static func log_height(milli_per_second: int, top_decade: int) -> float:
	var value: float = maxf(1.0, float(milli_per_second) / Fixed.ONE)
	return clampf(log(value) / log(10.0) / float(top_decade), 0.0, 1.0)


## Puissance de 10 du haut de la courbe (au moins 10³).
static func top_decade_for(peak_milli: int) -> int:
	var peak: float = maxf(1.0, float(peak_milli) / Fixed.ONE)
	return maxi(3, ceili(log(peak) / log(10.0) + 0.001))


func _draw() -> void:
	var palette: Palette = Settings.palette()
	var area := Rect2(Vector2.ZERO, size)
	draw_rect(area, palette.background)
	var peak: int = 0
	for value: int in _history:
		peak = maxi(peak, value)
	var top: int = top_decade_for(peak)
	# Une ligne discrète par puissance de 10.
	for decade: int in range(1, top):
		var y: float = size.y * (1.0 - float(decade) / float(top))
		draw_line(Vector2(0.0, y), Vector2(size.x, y), palette.line, 1.0)
	if _history.size() < 2:
		return
	var points := PackedVector2Array()
	@warning_ignore("integer_division")
	var step: int = maxi(1, _history.size() / maxi(1, int(size.x)))
	for tick: int in range(0, _history.size(), step):
		points.append(_point(tick, _history[tick], top))
	points.append(_point(_history.size() - 1, _history[_history.size() - 1], top))
	draw_polyline(points, _color, 3.0, true)


func _point(tick: int, value: int, top: int) -> Vector2:
	var x: float = size.x * float(tick) / float(_duration)
	var y: float = size.y * (1.0 - log_height(value, top))
	return Vector2(x, y)
