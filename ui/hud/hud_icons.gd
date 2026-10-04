class_name HudIcons
extends RefCounted
## Petits pictogrammes en trait de l'écran de partie (maquettes G3), dessinés à la volée :
## capacités (Salve, Mur, Nuage) et œil (voir la carte pendant le choix d'une mutation).
## Les tracés suivent les dessins des maquettes (48 × 48).

## Épaisseur du trait, en unités du dessin de référence.
const STROKE: float = 4.5


## Dessine le pictogramme d'une capacité (AbilityDef.Kind) dans un carré de côté « size ».
static func draw_ability(
	canvas: CanvasItem, kind: int, center: Vector2, size: float, color: Color
) -> void:
	match kind:
		AbilityDef.Kind.SALVO:
			_line(canvas, center, size, [Vector2(14, 25), Vector2(24, 16), Vector2(34, 25)], color)
			_line(canvas, center, size, [Vector2(14, 34), Vector2(24, 25), Vector2(34, 34)], color)
		AbilityDef.Kind.WALL:
			_line(canvas, center, size, [Vector2(10, 18), Vector2(38, 18)], color)
			_line(canvas, center, size, [Vector2(10, 30), Vector2(38, 30)], color)
			_line(canvas, center, size, [Vector2(18, 18), Vector2(18, 30)], color)
			_line(canvas, center, size, [Vector2(30, 18), Vector2(30, 30)], color)
		AbilityDef.Kind.CLOUD:
			var width: float = STROKE * size / 48.0
			canvas.draw_arc(
				_at(center, size, Vector2(20, 24)),
				7.0 * size / 48.0,
				PI * 0.5,
				PI * 1.6,
				12,
				color,
				width,
				true
			)
			canvas.draw_arc(
				_at(center, size, Vector2(28, 21)),
				8.0 * size / 48.0,
				PI * 1.0,
				PI * 2.0,
				12,
				color,
				width,
				true
			)
			canvas.draw_arc(
				_at(center, size, Vector2(33, 26)),
				5.0 * size / 48.0,
				PI * 1.5,
				PI * 2.5,
				12,
				color,
				width,
				true
			)
			_line(canvas, center, size, [Vector2(20, 31), Vector2(33, 31)], color)
			_line(canvas, center, size, [Vector2(18, 37), Vector2(30, 37)], color)


## Dessine un œil (contour en amande et pupille) dans un carré de côté « size ».
static func draw_eye(canvas: CanvasItem, center: Vector2, size: float, color: Color) -> void:
	var points := PackedVector2Array()
	for i: int in range(17):
		var t: float = float(i) / 16.0
		points.append(_at(center, size, Vector2(6 + 36 * t, 24 - sin(t * PI) * 12)))
	for i: int in range(1, 17):
		var t: float = 1.0 - float(i) / 16.0
		points.append(_at(center, size, Vector2(6 + 36 * t, 24 + sin(t * PI) * 12)))
	canvas.draw_polyline(points, color, STROKE * size / 48.0, true)
	canvas.draw_circle(center, 5.5 * size / 48.0, color)


static func _line(
	canvas: CanvasItem, center: Vector2, size: float, points: Array[Vector2], color: Color
) -> void:
	var placed := PackedVector2Array()
	for point: Vector2 in points:
		placed.append(_at(center, size, point))
	canvas.draw_polyline(placed, color, STROKE * size / 48.0, true)


static func _at(center: Vector2, size: float, point: Vector2) -> Vector2:
	return center + (point - Vector2(24, 24)) * size / 48.0
