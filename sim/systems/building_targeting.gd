class_name BuildingTargeting
extends RefCounted
## Cibles des bâtiments (GDD §5 bis), fixes par type et comptées depuis la case du bâtiment :
## Essaimeur, la case libre collée à mon territoire la plus proche ; Avant-poste, la case
## adverse collée à mon territoire la plus proche (décidé le 6 octobre 2026 : plus de cases
## libres) ; Mortier, le bâtiment ou le Sporophore
## adverse le plus proche, même loin de mon territoire. La cible désignée au clic passe d'abord
## si le bâtiment peut la frapper ; une cible est gardée tant qu'elle reste visable.


## Vrai si le bâtiment peut viser la case. « reach » : sa portée déjà calculée (−1 : la calculer).
static func can_target(
	state: GameState, colony: ColonyState, building: BuildingState, cell: int, reach: int = -1
) -> bool:
	if cell < 0 or cell == building.cell:
		return false
	if reach < 0:
		reach = ColonyStats.building_reach(state.defs, colony, building.type)
	if state.distance(building.cell, cell) > reach:
		return false
	var owner: int = state.owner[cell]
	match state.defs.buildings[building.type].kind:
		BuildingDef.Kind.MORTAR:
			if owner == colony.id or owner < 0 or not state.protection_over():
				return false
			if state.colonies[owner].turret == cell:
				return true
			var other: BuildingState = state.standing_building(cell)
			return other != null and other.owner != colony.id
		BuildingDef.Kind.SWARMER:
			if owner >= 0:
				return false
		_:
			# Avant-poste : cases adverses seulement (décidé le 6 octobre 2026).
			if owner < 0 or owner == colony.id or not state.protection_over():
				return false
	return state.touches_colony(cell, colony.id)


## Remet à jour les cibles gardées du bâtiment (comme Targeting.refresh() pour le Sporophore) et
## renvoie vrai s'il peut frapper la cible désignée de la colonie, qui passe alors d'abord.
static func refresh(
	state: GameState, colony: ColonyState, building: BuildingState, reach: int, spores: int
) -> bool:
	var designated: bool = (
		colony.designated >= 0 and can_target(state, colony, building, colony.designated, reach)
	)
	var kept := PackedInt32Array()
	for cell: int in building.targets:
		if cell == colony.designated or kept.has(cell):
			continue
		if can_target(state, colony, building, cell, reach):
			kept.append(cell)
	var wanted: int = spores - (1 if designated else 0)
	if kept.size() < wanted:
		var excluded := kept.duplicate()
		excluded.append(colony.designated)
		kept.append_array(_best(state, colony, building, reach, wanted - kept.size(), excluded))
	elif kept.size() > wanted:
		kept.resize(maxi(0, wanted))
	building.targets = kept
	return designated


## Cibles du prochain tir : la cible désignée (si le bâtiment peut la frapper), puis les gardées.
static func shot_targets(
	colony: ColonyState, building: BuildingState, designated: bool
) -> PackedInt32Array:
	var cells := PackedInt32Array()
	if designated:
		cells.append(colony.designated)
	cells.append_array(building.targets)
	return cells


## Les « count » cases visables les plus proches du bâtiment (départage : rang tiré de la
## graine), sans celles de « excluded ».
static func _best(
	state: GameState,
	colony: ColonyState,
	building: BuildingState,
	reach: int,
	count: int,
	excluded: PackedInt32Array,
) -> PackedInt32Array:
	var keys := PackedInt64Array()
	for cell: int in state.map.disk(building.cell, reach):
		if excluded.has(cell) or not can_target(state, colony, building, cell, reach):
			continue
		var distance: int = state.distance(building.cell, cell)
		keys.append(distance * Targeting.MAX_CELLS + state.cell_rank[cell])
	keys.sort()
	var found := PackedInt32Array()
	var mask: int = Targeting.MAX_CELLS - 1
	for i: int in range(mini(count, keys.size())):
		found.append(state.cell_by_rank[keys[i] & mask])
	return found
