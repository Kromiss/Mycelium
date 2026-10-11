class_name HotspotPlanner
extends RefCounted
## Où un robot pose ses points chauds (GDD §2.5, décidé le 11 octobre 2026), selon le but de
## chaque place de son profil :
## - TURRET : le Sporophore adverse le plus proche, dès la fin de la protection (sinon RICH) ;
## - RICH : la case libre de la zone la plus centrale à « rich_reach » cases au plus du
##   territoire, la plus proche ;
## - CENTER : la case centrale tant que la zone 5 n'est pas atteinte, puis la case adverse la
##   plus proche du Sporophore (sinon RICH).
## Les règles du jeu restent dans sim/ : on ne fait que lire l'état.

const TURRET: StringName = &"turret"
const RICH: StringName = &"rich"
const CENTER: StringName = &"center"


## But de la prochaine place à remplir : celui des places du profil (dans l'ordre) qui manque
## parmi les buts des points chauds déjà posés (« goals », un par point chaud). Vide s'il n'y a
## pas de place libre ou pas de but.
static func next_goal(
	profile: RobotProfile, max_hotspots: int, goals: Array[StringName]
) -> StringName:
	if profile.hotspot_goals.is_empty() or goals.size() >= max_hotspots:
		return &""
	var left: Array[StringName] = goals.duplicate()
	for slot: int in range(max_hotspots):
		var goal: StringName = profile.hotspot_goals[slot % profile.hotspot_goals.size()]
		var position: int = left.find(goal)
		if position < 0:
			return goal
		left.remove_at(position)
	return profile.hotspot_goals[0]


## Case à viser pour un but (−1 : aucune). « hunts » : faux si le robot ne vise pas les
## Sporophores (Facile). Les cases de « taken » sont évitées (points chauds déjà posés).
static func pick(
	state: GameState,
	colony: ColonyState,
	profile: RobotProfile,
	goal: StringName,
	hunts: bool,
	taken: PackedInt32Array
) -> int:
	var cell: int = -1
	if goal == TURRET and hunts and state.protection_over():
		cell = _closest_turret(state, colony, taken)
	elif goal == CENTER:
		cell = _center_or_enemy(state, colony, taken)
	if cell < 0:
		cell = _richest(state, colony, profile.rich_reach, taken)
	return cell


static func _closest_turret(state: GameState, colony: ColonyState, taken: PackedInt32Array) -> int:
	var best: int = -1
	var best_distance: int = 0
	for other: ColonyState in state.colonies:
		if other.id == colony.id or not other.alive or taken.has(other.turret):
			continue
		var distance: int = state.distance(colony.turret, other.turret)
		if best < 0 or distance < best_distance:
			best = other.turret
			best_distance = distance
	return best


static func _center_or_enemy(state: GameState, colony: ColonyState, taken: PackedInt32Array) -> int:
	var center: int = state.map.index_of(Vector2i.ZERO)
	var inner_zone: int = state.defs.zone_count() - 2
	var reached: bool = inner_zone >= 0 and colony.zone_ticks[inner_zone] >= 0
	if not reached and state.owner[center] != colony.id and not taken.has(center):
		return center
	var best: int = -1
	var best_distance: int = 0
	for cell: int in range(state.cell_count()):
		var owner: int = state.owner[cell]
		if owner < 0 or owner == colony.id or taken.has(cell):
			continue
		var distance: int = state.distance(colony.turret, cell)
		if best < 0 or distance < best_distance:
			best = cell
			best_distance = distance
	return best


## Case libre de la zone la plus centrale à « reach » cases au plus du territoire ; à égalité, la
## plus proche du territoire, puis selon le rang tiré de la graine.
static func _richest(
	state: GameState, colony: ColonyState, reach: int, taken: PackedInt32Array
) -> int:
	var distances: PackedInt32Array = _territory_distances(state, colony.id, reach)
	var best: int = -1
	for cell: int in range(state.cell_count()):
		var distance: int = distances[cell]
		if distance <= 0 or state.owner[cell] >= 0 or taken.has(cell):
			continue
		if best < 0 or _richer(state, cell, distance, best, distances[best]):
			best = cell
	return best


static func _richer(
	state: GameState, cell: int, distance: int, other: int, other_distance: int
) -> bool:
	var zones: PackedInt32Array = state.map.zones
	if zones[cell] != zones[other]:
		return zones[cell] > zones[other]
	if distance != other_distance:
		return distance < other_distance
	return state.cell_rank[cell] < state.cell_rank[other]


## Distance de chaque case au territoire de la colonie, jusqu'à « reach » (0 : à la colonie ;
## −1 : plus loin).
static func _territory_distances(state: GameState, colony_id: int, reach: int) -> PackedInt32Array:
	var distances := PackedInt32Array()
	distances.resize(state.cell_count())
	distances.fill(-1)
	var frontier := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if state.owner[cell] == colony_id:
			distances[cell] = 0
			frontier.append(cell)
	var table: PackedInt32Array = state.map.neighbor_table
	var next: int = 0
	while next < frontier.size():
		var cell: int = frontier[next]
		next += 1
		if distances[cell] >= reach:
			continue
		for slot: int in range(cell * 6, cell * 6 + 6):
			var other: int = table[slot]
			if other >= 0 and distances[other] < 0:
				distances[other] = distances[cell] + 1
				frontier.append(other)
	return distances
