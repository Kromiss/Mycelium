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
