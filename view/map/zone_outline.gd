class_name ZoneOutline
extends RefCounted
## Calcule le contour arrondi d'une région de la forêt (toutes les cases d'une zone
## donnée ou plus centrale), pour tracer et remplir les zones dans le style « Pastille ronde ».
##
## Méthode : on relève les côtés d'hexagones qui séparent la région du reste, on les enchaîne
## en une boucle, on garde le milieu de chaque côté (ce qui transforme les dents de scie en
## lignes droites, à mi-chemin entre deux rangées de cases), puis on arrondit les angles.

## Nombre de passes d'arrondi (algorithme de Chaikin).
const SMOOTHING_PASSES: int = 2


## Contour de la région « zone >= min_zone », en pixels, pour des hexagones de taille « size ».
## Renvoie une boucle fermée (le dernier point n'est pas répété).
static func region_outline(map: ForestMap, min_zone: int, size: float) -> PackedVector2Array:
	var midpoints: PackedVector2Array = _boundary_midpoints(map, min_zone, size)
	return smooth(midpoints, SMOOTHING_PASSES)


## Arrondit une boucle fermée par l'algorithme de Chaikin : chaque côté est remplacé par
## deux points placés au quart et aux trois quarts de sa longueur.
static func smooth(loop: PackedVector2Array, passes: int) -> PackedVector2Array:
	var result: PackedVector2Array = loop
	for _pass: int in range(passes):
		var next: PackedVector2Array = PackedVector2Array()
		var count: int = result.size()
		for i: int in range(count):
			var a: Vector2 = result[i]
			var b: Vector2 = result[(i + 1) % count]
			next.append(a.lerp(b, 0.25))
			next.append(a.lerp(b, 0.75))
		result = next
	return result


## Milieux des côtés frontière de la région, dans l'ordre du contour.
static func _boundary_midpoints(map: ForestMap, min_zone: int, size: float) -> PackedVector2Array:
	# Chaque côté frontière va d'un coin à l'autre, toujours dans le même sens de rotation :
	# on peut donc retrouver le côté suivant à partir du coin d'arrivée.
	var next_by_start: Dictionary[Vector2i, Vector2i] = {}
	var midpoint_by_start: Dictionary[Vector2i, Vector2] = {}
	for index: int in range(map.size()):
		if map.zones[index] < min_zone:
			continue
		var cell: Vector2i = map.cells[index]
		var center: Vector2 = Hex.to_pixel(cell, size)
		for direction: int in range(6):
			var other: Vector2i = Hex.neighbor(cell, direction)
			if map.has_cell(other) and map.zone_of(other) >= min_zone:
				continue
			var corners: Vector2i = Hex.edge_corners(direction)
			var start: Vector2 = Hex.corner(center, size, corners.x)
			var finish: Vector2 = Hex.corner(center, size, corners.y)
			next_by_start[_key(start, size)] = _key(finish, size)
			midpoint_by_start[_key(start, size)] = (start + finish) * 0.5
	return _chain(next_by_start, midpoint_by_start)


## Enchaîne les côtés en une boucle, en partant du plus petit coin pour un résultat stable.
static func _chain(
	next_by_start: Dictionary[Vector2i, Vector2i], midpoint_by_start: Dictionary[Vector2i, Vector2]
) -> PackedVector2Array:
	var result: PackedVector2Array = PackedVector2Array()
	if next_by_start.is_empty():
		return result
	var keys: Array[Vector2i] = []
	keys.assign(next_by_start.keys())
	keys.sort()
	var first: Vector2i = keys[0]
	var current: Vector2i = first
	for _step: int in range(next_by_start.size()):
		result.append(midpoint_by_start[current])
		current = next_by_start[current]
		if current == first:
			break
	assert(current == first, "Le contour de la région n'est pas une boucle unique.")
	return result


## Clé entière d'un coin, pour retrouver un même coin calculé depuis deux cases voisines.
static func _key(point: Vector2, size: float) -> Vector2i:
	var scale: float = 1000.0 / size
	return Vector2i(roundi(point.x * scale), roundi(point.y * scale))
