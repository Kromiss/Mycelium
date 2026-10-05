class_name Threats
extends RefCounted
## Ce qu'un robot voit des attaques adverses, comme un joueur voit les spores sur la carte :
## les cases de la colonie visées par une Tourelle ou un bâtiment adverse (cible désignée ou
## cibles gardées).


## Cases de la colonie visées par une autre colonie, sans doublon, Tourelle d'abord puis par
## numéro de case.
static func attacked_cells(state: GameState, colony: ColonyState) -> PackedInt32Array:
	var cells := PackedInt32Array()
	for other: ColonyState in state.colonies:
		if other.id == colony.id or not other.alive:
			continue
		var aimed := PackedInt32Array(other.targets)
		if other.designated >= 0:
			aimed.append(other.designated)
		for building: BuildingState in Buildings.of_colony(state, other.id):
			aimed.append_array(building.targets)
		for cell: int in aimed:
			if state.owner[cell] == colony.id and not cells.has(cell):
				cells.append(cell)
	cells.sort()
	if cells.has(colony.turret):
		cells.erase(colony.turret)
		cells.insert(0, colony.turret)
	return cells


## Case attaquée la plus proche de la Tourelle (−1 : aucune).
static func closest_to_turret(
	state: GameState, colony: ColonyState, cells: PackedInt32Array
) -> int:
	var best: int = -1
	var best_distance: int = 0
	for cell: int in cells:
		var distance: int = state.distance(cell, colony.turret)
		if best < 0 or distance < best_distance:
			best = cell
			best_distance = distance
	return best
