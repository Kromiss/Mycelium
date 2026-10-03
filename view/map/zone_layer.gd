class_name ZoneLayer
extends Node2D
## Calque qui dessine les zones de la forêt : soit leur fond (polygones remplis, sous les
## bulles), soit leur trait (au-dessus des bulles).

enum Mode { FILL, LINE }

## Ce que dessine ce calque.
@export var mode: Mode = Mode.FILL
## Épaisseur du trait des zones, en pixels de carte (il suit le zoom).
@export var line_width: float = 3.0

var _outlines: Array[PackedVector2Array] = []
var _colors: Array[Color] = []


## Remplace les contours et les couleurs à dessiner (un contour et une couleur par zone,
## de la zone 1 vers le centre).
func set_outlines(outlines: Array[PackedVector2Array], colors: Array[Color]) -> void:
	_outlines = outlines
	_colors = colors
	queue_redraw()


func _draw() -> void:
	for i: int in range(_outlines.size()):
		var outline: PackedVector2Array = _outlines[i]
		if outline.size() < 3:
			continue
		if mode == Mode.FILL:
			# Les zones sont peintes du bord vers le centre : chacune recouvre l'intérieur
			# de la précédente.
			draw_colored_polygon(outline, _colors[i])
		else:
			var closed: PackedVector2Array = outline.duplicate()
			closed.append(outline[0])
			draw_polyline(closed, _colors[i], line_width, true)
