class_name Hex
extends RefCounted
## Outils de la grille d'hexagones « pointe en haut », en coordonnées axiales (q, r).
## Une case est un Vector2i : x = q, y = r.
## Référence : https://www.redblobgames.com/grids/hexagons/

## Les six directions voisines, dans un ordre fixe : est, nord-est, nord-ouest,
## ouest, sud-ouest, sud-est (axe y de l'écran vers le bas).
const DIRECTIONS: Array[Vector2i] = [
	Vector2i(1, 0),
	Vector2i(1, -1),
	Vector2i(0, -1),
	Vector2i(-1, 0),
	Vector2i(-1, 1),
	Vector2i(0, 1),
]

const SQRT3: float = 1.7320508075688772


## Case voisine dans la direction donnée (0 à 5).
static func neighbor(cell: Vector2i, direction: int) -> Vector2i:
	return cell + DIRECTIONS[direction]


## Les six cases voisines, dans l'ordre de DIRECTIONS.
static func neighbors(cell: Vector2i) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for offset: Vector2i in DIRECTIONS:
		result.append(cell + offset)
	return result


## Distance en nombre de cases entre deux cases.
static func distance(a: Vector2i, b: Vector2i) -> int:
	var dq: int = a.x - b.x
	var dr: int = a.y - b.y
	@warning_ignore("integer_division")
	return (absi(dq) + absi(dr) + absi(dq + dr)) / 2


## Distance d'une case au centre de la forêt.
static func length(cell: Vector2i) -> int:
	return distance(cell, Vector2i.ZERO)


## Nombre de cases d'une forêt hexagonale de rayon donné.
static func cell_count(radius: int) -> int:
	return 3 * radius * (radius + 1) + 1


## Toutes les cases à une distance inférieure ou égale au rayon.
## L'ordre est fixe (q croissant, puis r croissant) : la simulation en dépend.
static func cells_in_radius(radius: int) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	for q: int in range(-radius, radius + 1):
		var r_min: int = maxi(-radius, -q - radius)
		var r_max: int = mini(radius, -q + radius)
		for r: int in range(r_min, r_max + 1):
			result.append(Vector2i(q, r))
	return result


## Centre d'une case à l'écran, pour des hexagones de rayon extérieur « size ».
## Réservé à l'affichage : la simulation ne manipule jamais de positions en pixels.
static func to_pixel(cell: Vector2i, size: float) -> Vector2:
	return Vector2(size * SQRT3 * (cell.x + cell.y * 0.5), size * 1.5 * cell.y)


## Case qui contient un point de l'écran, pour des hexagones de rayon extérieur « size »
## (inverse de to_pixel). Réservé à l'affichage et aux entrées.
static func from_pixel(point: Vector2, size: float) -> Vector2i:
	var q: float = (SQRT3 / 3.0 * point.x - point.y / 3.0) / size
	var r: float = (2.0 / 3.0 * point.y) / size
	return round_axial(q, r)


## Arrondit des coordonnées axiales fractionnaires à la case la plus proche.
static func round_axial(q: float, r: float) -> Vector2i:
	var s: float = -q - r
	var rq: float = roundf(q)
	var rr: float = roundf(r)
	var rs: float = roundf(s)
	var dq: float = absf(rq - q)
	var dr: float = absf(rr - r)
	var ds: float = absf(rs - s)
	if dq > dr and dq > ds:
		rq = -rr - rs
	elif dr > ds:
		rr = -rq - rs
	return Vector2i(roundi(rq), roundi(rr))


## Coin numéro « index » (0 à 5) d'un hexagone pointe en haut. Le coin 0 est en haut à droite,
## puis les coins tournent dans le sens des aiguilles d'une montre à l'écran.
static func corner(center: Vector2, size: float, index: int) -> Vector2:
	var angle: float = deg_to_rad(60.0 * index - 30.0)
	return center + Vector2(cos(angle), sin(angle)) * size


## Les deux coins du côté qui fait face à la direction donnée, dans le sens des aiguilles
## d'une montre : en suivant ces côtés, une région de cases est toujours parcourue
## dans le même sens.
static func edge_corners(direction: int) -> Vector2i:
	return Vector2i((6 - direction) % 6, (7 - direction) % 6)
