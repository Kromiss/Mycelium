class_name ForestMap
extends RefCounted
## Carte de la forêt : les cases, leur terrain et leur zone.
## Les données sont rangées dans des tableaux compacts, indexés par numéro de case.

## Terrains possibles. Pour l'instant, un seul : l'Humus (GDD §4.2).
enum Terrain { HUMUS }

## Rayon de la forêt, en cases.
var radius: int = 0
## Nombre de zones.
var zone_count: int = 0
## Coordonnées axiales de chaque case, dans l'ordre fixe de Hex.cells_in_radius().
var cells: Array[Vector2i] = []
## Zone de chaque case (1 au bord, zone_count au centre).
var zones: PackedInt32Array = PackedInt32Array()
## Terrain de chaque case.
var terrains: PackedInt32Array = PackedInt32Array()
## Voisines de chaque case : 6 entrées par case, dans l'ordre de Hex.DIRECTIONS,
## −1 hors de la forêt. Rempli par build_neighbors().
var neighbor_table: PackedInt32Array = PackedInt32Array()

var _index_by_cell: Dictionary[Vector2i, int] = {}


## Nombre de cases.
func size() -> int:
	return cells.size()


## Ajoute une case à la carte. Réservé au générateur.
func add_cell(cell: Vector2i, zone: int, terrain: Terrain) -> void:
	_index_by_cell[cell] = cells.size()
	cells.append(cell)
	zones.append(zone)
	terrains.append(terrain)


## Calcule la table des voisines. Réservé au générateur, une fois toutes les cases ajoutées.
func build_neighbors() -> void:
	neighbor_table = PackedInt32Array()
	neighbor_table.resize(cells.size() * 6)
	for index: int in range(cells.size()):
		for direction: int in range(6):
			neighbor_table[index * 6 + direction] = index_of(Hex.neighbor(cells[index], direction))


## Numéro de la voisine d'une case dans une direction (0 à 5), ou −1 hors de la forêt.
func neighbor_index(index: int, direction: int) -> int:
	return neighbor_table[index * 6 + direction]


## Numéro d'une case, ou −1 si elle n'est pas dans la forêt.
func index_of(cell: Vector2i) -> int:
	return _index_by_cell.get(cell, -1)


## Vrai si la case fait partie de la forêt.
func has_cell(cell: Vector2i) -> bool:
	return _index_by_cell.has(cell)


## Zone d'une case de la forêt.
func zone_of(cell: Vector2i) -> int:
	return zones[index_of(cell)]


## Nombre de cases dans une zone.
func count_in_zone(zone: int) -> int:
	var total: int = 0
	for value: int in zones:
		if value == zone:
			total += 1
	return total
