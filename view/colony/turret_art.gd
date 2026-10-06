class_name TurretArt
extends RefCounted
## Dessin du Sporophore (maquettes G3) : un disque crème cerclé de la teinte foncée de la
## colonie, et dedans un champignon aux deux yeux. Trois stades (GDD §16.3, décidé le
## 4 octobre 2026) : chapeau uni (paliers 0 à 2), chapeau tacheté (paliers 3 et 4), petits
## chapeaux au pied (paliers 5 et 6). Les coordonnées viennent du dessin des maquettes (48 × 48).

## Fond du disque et du pied (crème, identique dans les deux thèmes, comme sur les maquettes).
const CREAM := Color("#FFFDF8")
## Yeux du champignon (prune foncé, identique dans les deux thèmes pour rester lisible sur
## le pied crème).
const INK := Color("#3B3340")
## Taille du disque selon le stade, en multiple du rayon d'une bulle.
const STAGE_SCALES: Array[float] = [1.35, 1.55, 1.75]
## Taille du champignon par rapport au rayon du disque.
const MUSHROOM_SCALE: float = 1.5
## Palier à partir duquel la Tourelle passe au stade 2, puis au stade 3.
const STAGE_TIERS: Array[int] = [3, 5]


## Stade d'apparence de la Tourelle (0 à 2) selon le palier de sa colonie.
static func stage_for(tier: int) -> int:
	var stage: int = 0
	for threshold: int in STAGE_TIERS:
		if tier >= threshold:
			stage += 1
	return stage


## Dessine le Sporophore centré sur « center ». « radius » : rayon du disque. « ink » : couleur
## des yeux. « alpha » : opacité de l'ensemble (pas en cours).
static func draw(
	canvas: CanvasItem,
	center: Vector2,
	radius: float,
	stage: int,
	dark: Color,
	main: Color,
	ink: Color,
	alpha: float = 1.0
) -> void:
	var cream: Color = CREAM
	cream.a = alpha
	var ring: Color = dark
	ring.a = alpha
	canvas.draw_circle(center, radius, ring)
	canvas.draw_circle(center, radius * 0.86, cream)
	draw_mushroom(canvas, center, radius * MUSHROOM_SCALE, stage, dark, main, ink, alpha)


## Le champignon seul, dans un carré de côté « size » centré sur « center ».
static func draw_mushroom(
	canvas: CanvasItem,
	center: Vector2,
	size: float,
	stage: int,
	dark: Color,
	main: Color,
	ink: Color,
	alpha: float = 1.0
) -> void:
	var cap: Color = dark
	cap.a = alpha
	var cream: Color = CREAM
	cream.a = alpha
	var eye: Color = ink
	eye.a = alpha
	var foot: Color = main
	foot.a = alpha
	if stage >= 2:
		# Petits chapeaux au pied (fin de partie).
		canvas.draw_colored_polygon(_dome(center, size, Vector2(11, 33), 7.0, 7.0), foot)
		canvas.draw_colored_polygon(_dome(center, size, Vector2(37, 33), 7.0, 7.0), foot)
	canvas.draw_colored_polygon(_dome(center, size, Vector2(24, 27), 17.0, 17.0), cap)
	# Pied : rectangle à fond arrondi.
	canvas.draw_rect(Rect2(_at(center, size, Vector2(18, 27)), Vector2(12, 3) * size / 48.0), cream)
	canvas.draw_circle(_at(center, size, Vector2(24, 30)), 6.0 * size / 48.0, cream)
	canvas.draw_circle(_at(center, size, Vector2(21, 31)), 1.8 * size / 48.0, eye)
	canvas.draw_circle(_at(center, size, Vector2(27, 31)), 1.8 * size / 48.0, eye)
	if stage >= 1:
		# Chapeau tacheté (vers le palier 3).
		canvas.draw_circle(_at(center, size, Vector2(17, 19)), 2.4 * size / 48.0, cream)
		canvas.draw_circle(_at(center, size, Vector2(29, 16)), 1.8 * size / 48.0, cream)


## Point du dessin de référence (48 × 48) placé dans le carré de côté « size ».
static func _at(center: Vector2, size: float, point: Vector2) -> Vector2:
	return center + (point - Vector2(24, 24)) * size / 48.0


## Demi-ellipse posée sur sa base (chapeau) : base au point « base », rayons rx et ry.
static func _dome(
	center: Vector2, size: float, base: Vector2, rx: float, ry: float
) -> PackedVector2Array:
	var points := PackedVector2Array()
	var steps: int = 16
	for i: int in range(steps + 1):
		var angle: float = PI + PI * float(i) / float(steps)
		points.append(_at(center, size, base + Vector2(cos(angle) * rx, sin(angle) * ry)))
	return points
