class_name BuildPlanner
extends RefCounted
## Bâtiments d'un robot (GDD §5 bis, décidé le 5 octobre 2026) : il construit selon son profil,
## toujours sur le front. Le type voulu est celui de plus fort poids rapporté au nombre déjà
## posé (poids / (1 + nombre)), parmi les types débloqués ; la case est celle d'où le bâtiment
## aura le plus à faire (RobotProfile : valeur des cases libres, des zones riches, des cases
## adverses, des bâtiments et Sporophores adverses). Places prises : un bâtiment qui n'a plus
## rien à viser est démoli pour reconstruire là où il sert.

## Nombre de déplacements du bâtiment le plus cher que le robot garde de quoi payer, toutes
## places prises.
const RELOCATIONS: int = 2
## Score d'un Mortier sans cible à portée : il se rapproche du Sporophore adverse le plus proche.
const MORTAR_FALLBACK: int = 1_000


## Rangs des types de bâtiment que le robot veut poser, du plus voulu au moins voulu : poids
## rapporté au nombre déjà posé (poids / (1 + nombre)), parmi les types débloqués.
static func wanted_types(
	state: GameState, colony: ColonyState, profile: RobotProfile
) -> PackedInt32Array:
	var counts := PackedInt32Array()
	counts.resize(state.defs.buildings.size())
	for building: BuildingState in Buildings.of_colony(state, colony.id):
		counts[building.type] += 1
	var ranked: Array[Vector2i] = []
	for type: int in range(state.defs.buildings.size()):
		var def: SimBuilding = state.defs.buildings[type]
		var weight: int = profile.building_weight(def.id)
		if weight <= 0 or colony.tier < def.unlock_tier:
			continue
		@warning_ignore("integer_division")
		ranked.append(Vector2i(-weight * 1000 / (1 + counts[type]), type))
	ranked.sort()
	var types := PackedInt32Array()
	for entry: Vector2i in ranked:
		types.append(entry.y)
	return types


## Rang du type de bâtiment que le robot veut poser ensuite (−1 : aucun débloqué ou voulu).
static func wanted_type(state: GameState, colony: ColonyState, profile: RobotProfile) -> int:
	var types: PackedInt32Array = wanted_types(state, colony, profile)
	return types[0] if not types.is_empty() else -1


## Enzymes que le robot garde pour ses bâtiments : le prix du prochain s'il reste une place,
## sinon de quoi déplacer le plus cher (démolir puis reconstruire sur le front) ; les Enzymes ne
## reviennent qu'avec les paliers et les Trophées. Les capacités n'utilisent que le reste.
static func reserve(state: GameState, colony: ColonyState, profile: RobotProfile) -> int:
	var types: PackedInt32Array = wanted_types(state, colony, profile)
	if types.is_empty():
		return 0
	var slots: int = ColonyStats.building_slots(state.defs, colony)
	if Buildings.standing_count(state, colony.id) < slots:
		return Fixed.from_units(state.defs.buildings[types[0]].cost_enzymes)
	var most: int = 0
	for type: int in types:
		most = maxi(most, state.defs.buildings[type].cost_enzymes)
	return Fixed.from_units(most * RELOCATIONS)


## Prix d'une pose, en millièmes d'Enzymes.
static func cost_of(state: GameState, command: BuildCommand) -> int:
	var type: int = state.defs.building_index(command.building)
	return Fixed.from_units(state.defs.buildings[type].cost_enzymes) if type >= 0 else 0


## Commande de bâtiment du robot à ce tick (null : rien à faire) : la pose du type le plus voulu
## qui a une case utile, ou la démolition d'un bâtiment inutile quand toutes les places sont
## prises et qu'un autre bâtiment serait payable et utile.
static func plan(state: GameState, colony: ColonyState, profile: RobotProfile) -> Command:
	if colony.turret < 0:
		return null
	var full: bool = (
		Buildings.standing_count(state, colony.id) >= ColonyStats.building_slots(state.defs, colony)
	)
	var idle: BuildingState = _idle(state, colony, profile) if full else null
	if full and idle == null:
		return null
	for type: int in wanted_types(state, colony, profile):
		var def: SimBuilding = state.defs.buildings[type]
		if colony.enzymes < Fixed.from_units(def.cost_enzymes):
			# On attend le type le plus voulu plutôt que de poser un bâtiment moins voulu.
			return null
		var cell: int = best_cell(state, colony, profile, type)
		if cell < 0:
			continue
		if full:
			return DemolishCommand.new(state.map.cells[idle.cell], colony.id)
		return BuildCommand.new(def.id, state.map.cells[cell], colony.id)
	return null


## Meilleure case pour poser un bâtiment du type (−1 : aucune case utile).
static func best_cell(
	state: GameState, colony: ColonyState, profile: RobotProfile, type: int
) -> int:
	var defs: SimDefs = state.defs
	var kind: int = defs.buildings[type].kind
	var reach: int = ColonyStats.building_reach(defs, colony, type)
	var best: int = -1
	var best_score: int = 0
	var best_rank: int = 0
	for cell: int in range(state.cell_count()):
		if state.owner[cell] != colony.id or cell == colony.turret:
			continue
		if state.building_at[cell] >= 0:
			continue
		var score: int = 0
		if kind == BuildingDef.Kind.MORTAR:
			score = _mortar_score(state, colony, profile, cell, reach)
		else:
			score = _front_score(state, colony, profile, cell, reach, kind)
		if score <= 0:
			continue
		var rank: int = state.cell_rank[cell]
		if score > best_score or (score == best_score and rank < best_rank):
			best = cell
			best_score = score
			best_rank = rank
	return best


## Score d'une case pour un Essaimeur ou un Avant-poste : les cases qu'il pourra prendre à
## portée (libres collées à mon territoire, plus les zones riches ; adverses pour l'Avant-poste).
static func _front_score(
	state: GameState,
	colony: ColonyState,
	profile: RobotProfile,
	cell: int,
	reach: int,
	kind: int,
) -> int:
	var score: int = 0
	for other: int in state.map.disk(cell, reach):
		var owner: int = state.owner[other]
		if owner == colony.id:
			continue
		if owner >= 0 and kind == BuildingDef.Kind.SWARMER:
			continue
		if not state.touches_colony(other, colony.id):
			continue
		if owner < 0:
			score += profile.free_cell_value + profile.rich_zone_value * state.map.zones[other]
		else:
			score += profile.enemy_cell_value
	return score


## Score d'une case pour un Mortier : les Sporophores et bâtiments adverses à portée ; sans
## cible, plus il est près du Sporophore adverse le plus proche, mieux c'est.
static func _mortar_score(
	state: GameState, colony: ColonyState, profile: RobotProfile, cell: int, reach: int
) -> int:
	var score: int = 0
	var nearest: int = -1
	for other: ColonyState in state.colonies:
		if other.id == colony.id or not other.alive or other.turret < 0:
			continue
		var distance: int = state.distance(cell, other.turret)
		if distance <= reach:
			score += profile.enemy_turret_value
		if nearest < 0 or distance < nearest:
			nearest = distance
	for building: BuildingState in state.buildings:
		if building.owner == colony.id or not building.standing(state.tick):
			continue
		if state.distance(cell, building.cell) <= reach:
			score += profile.enemy_building_value
	if score > 0:
		return MORTAR_FALLBACK + score
	return maxi(1, MORTAR_FALLBACK - nearest) if nearest >= 0 else 0


## Bâtiment actif qui n'a plus rien à viser à portée (null : aucun), du type le moins voulu
## d'abord : un Mortier sans cible à portée compte aussi.
static func _idle(state: GameState, colony: ColonyState, profile: RobotProfile) -> BuildingState:
	var order: PackedInt32Array = wanted_types(state, colony, profile)
	order.reverse()
	for type: int in range(state.defs.buildings.size()):
		if not order.has(type):
			order.insert(0, type)
	for type: int in order:
		for building: BuildingState in Buildings.of_colony(state, colony.id):
			if building.type != type or not building.active(state.tick):
				continue
			var reach: int = ColonyStats.building_reach(state.defs, colony, building.type)
			var useful: bool = false
			for cell: int in state.map.disk(building.cell, reach):
				if BuildingTargeting.can_target(state, colony, building, cell, reach):
					useful = true
					break
			if not useful:
				return building
	return null
