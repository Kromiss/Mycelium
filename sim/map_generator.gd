class_name MapGenerator
extends RefCounted
## Génère la forêt d'une partie à partir de son mode.
## Au G0, la forêt n'a qu'un terrain (l'Humus) : seules les zones sont calculées.
## La graine sera utilisée quand la carte aura des éléments aléatoires.


## Crée la forêt du mode donné, découpée en « zone_count » zones de même épaisseur.
static func generate(mode: ModeDef, zone_count: int, _seed: int = 0) -> ForestMap:
	assert(zone_count > 0, "Il faut au moins une zone.")
	assert(mode.rings_per_zone > 0, "Une zone doit faire au moins un anneau d'épaisseur.")
	var map := ForestMap.new()
	map.zone_count = zone_count
	map.radius = mode.radius(zone_count)
	for cell: Vector2i in Hex.cells_in_radius(map.radius):
		map.add_cell(
			cell,
			zone_for_distance(Hex.length(cell), mode.rings_per_zone, zone_count),
			ForestMap.Terrain.HUMUS
		)
	return map


## Zone d'une case selon sa distance au centre : les « rings_per_zone » anneaux du centre
## forment la dernière zone, les anneaux du bord forment la zone 1.
static func zone_for_distance(distance: int, rings_per_zone: int, zone_count: int) -> int:
	@warning_ignore("integer_division")
	return zone_count - distance / rings_per_zone
