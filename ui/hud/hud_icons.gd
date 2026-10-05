class_name HudIcons
extends RefCounted
## Petits pictogrammes en trait de l'écran de partie (maquettes G3), dessinés à la volée :
## capacités (Salve, Mur, Nuage), bâtiments (Essaimeur, Avant-poste, Mortier, démolition) et
## œil (voir la carte pendant le choix d'une mutation).
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


## Dessine le pictogramme d'un bâtiment (BuildingDef.Kind) dans un carré de côté « size » :
## Essaimeur, une gerbe de spores ; Avant-poste, une petite tour et sa cible ; Mortier, un
## canon courbe et son projectile.
static func draw_building(
	canvas: CanvasItem, kind: int, center: Vector2, size: float, color: Color
) -> void:
	var dot: float = 4.5 * size / 48.0
	match kind:
		BuildingDef.Kind.SWARMER:
			canvas.draw_circle(_at(center, size, Vector2(24, 31)), dot * 1.3, color)
			for point: Vector2 in [Vector2(13, 20), Vector2(24, 14), Vector2(35, 20)]:
				canvas.draw_circle(_at(center, size, point), dot, color)
			_line(canvas, center, size, [Vector2(24, 26), Vector2(24, 20)], color)
			_line(canvas, center, size, [Vector2(21, 28), Vector2(16, 23)], color)
			_line(canvas, center, size, [Vector2(27, 28), Vector2(32, 23)], color)
		BuildingDef.Kind.OUTPOST:
			canvas.draw_arc(
				_at(center, size, Vector2(24, 24)),
				12.0 * size / 48.0,
				0.0,
				TAU,
				24,
				color,
				STROKE * size / 48.0,
				true
			)
			canvas.draw_circle(_at(center, size, Vector2(24, 24)), dot, color)
			_line(canvas, center, size, [Vector2(24, 6), Vector2(24, 13)], color)
			_line(canvas, center, size, [Vector2(24, 35), Vector2(24, 42)], color)
			_line(canvas, center, size, [Vector2(6, 24), Vector2(13, 24)], color)
			_line(canvas, center, size, [Vector2(35, 24), Vector2(42, 24)], color)
		BuildingDef.Kind.MORTAR:
			var bowl := PackedVector2Array()
			for i: int in range(13):
				var angle: float = PI * float(i) / 12.0
				bowl.append(_at(center, size, Vector2(24 - cos(angle) * 13, 27 + sin(angle) * 11)))
			canvas.draw_polyline(bowl, color, STROKE * size / 48.0, true)
			_line(canvas, center, size, [Vector2(11, 27), Vector2(37, 27)], color)
			canvas.draw_circle(_at(center, size, Vector2(31, 12)), dot * 1.2, color)
			_line(canvas, center, size, [Vector2(24, 25), Vector2(29, 16)], color)


## Dessine le pictogramme de la démolition (une croix) dans un carré de côté « size ».
static func draw_demolish(canvas: CanvasItem, center: Vector2, size: float, color: Color) -> void:
	_line(canvas, center, size, [Vector2(14, 14), Vector2(34, 34)], color)
	_line(canvas, center, size, [Vector2(34, 14), Vector2(14, 34)], color)


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
