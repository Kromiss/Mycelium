class_name MapGenerator
extends RefCounted
## Génère la forêt d'une partie à partir de son mode, et les positions de départ des colonies.
## La forêt n'a qu'un terrain (l'Humus) : seules les zones sont calculées.
## La graine sera utilisée quand la carte aura des éléments aléatoires.

## Nombre de cases de chaque colonie au départ, Cœur compris (GDD §3.1).
const START_CELLS: int = 3
## Rang du Cœur dans la liste des cases de départ.
const START_HEART: int = 0


## Crée la forêt du mode donné, découpée en « zone_count » zones de même épaisseur.
static func generate(mode: ModeDef, zone_count: int, _seed: int = 0) -> ForestMap:
	return generate_shape(mode.rings_per_zone, zone_count)


## Crée une forêt de « zone_count » zones, chacune épaisse de « rings_per_zone » anneaux.
static func generate_shape(rings_per_zone: int, zone_count: int) -> ForestMap:
	assert(zone_count > 0, "Il faut au moins une zone.")
	assert(rings_per_zone > 0, "Une zone doit faire au moins un anneau d'épaisseur.")
	var map := ForestMap.new()
	map.zone_count = zone_count
	map.radius = rings_per_zone * zone_count - 1
	for cell: Vector2i in Hex.cells_in_radius(map.radius):
		map.add_cell(
			cell,
			zone_for_distance(Hex.length(cell), rings_per_zone, zone_count),
			ForestMap.Terrain.HUMUS
		)
	map.build_neighbors()
	return map


## Zone d'une case selon sa distance au centre : les « rings_per_zone » anneaux du centre
## forment la dernière zone, les anneaux du bord forment la zone 1.
static func zone_for_distance(distance: int, rings_per_zone: int, zone_count: int) -> int:
	@warning_ignore("integer_division")
	return zone_count - distance / rings_per_zone


## Direction (0 à 5, voir Hex.DIRECTIONS) du coin de la forêt où démarre le secteur
## numéro « sector » parmi « sectors » (2, 3 ou 6) : les secteurs se partagent les coins
## à intervalles réguliers, le premier sur le coin est (à droite de l'écran).
static func sector_corner_direction(sector: int, sectors: int) -> int:
	assert([2, 3, 6].has(sectors), "Seuls 2, 3 ou 6 secteurs sont équitables.")
	@warning_ignore("integer_division")
	return (sector * (6 / sectors)) % 6


## Cases de départ d'un secteur (GDD §3.1, décidé le 4 octobre 2026) : le Cœur sur le coin
## de la forêt au milieu du secteur, la case collée vers le centre, et la case collée sur le
## bord à « +2 directions » du coin (au-dessus du Cœur pour le coin est). D'un secteur à
## l'autre, ces trois cases se déduisent par rotation : tous les départs sont identiques.
## Renvoie les coordonnées, Cœur en premier.
static func start_cells(radius: int, sector: int, sectors: int) -> Array[Vector2i]:
	var corner: int = sector_corner_direction(sector, sectors)
	var heart: Vector2i = Hex.DIRECTIONS[corner] * radius
	var inner: Vector2i = Hex.neighbor(heart, (corner + 3) % 6)
	var edge: Vector2i = Hex.neighbor(heart, (corner + 2) % 6)
	return [heart, inner, edge]
