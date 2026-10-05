class_name BuildPlanner
extends RefCounted
## Bâtiments d'un robot (GDD §5 bis, décidé le 5 octobre 2026) : il construit selon son profil,
## toujours sur le front. Le type voulu est celui de plus fort poids rapporté au nombre déjà
## posé (poids / (1 + nombre)), parmi les types débloqués ; la case est celle d'où le bâtiment
## aura le plus à faire (RobotProfile : valeur des cases libres, des zones riches, des cases
## adverses, des bâtiments et Sporophores adverses). Places prises : un Essaimeur ou un
## Avant-poste qui n'a plus rien à viser est démoli pour reconstruire plus loin.

## Score d'un Mortier sans cible à portée : il se rapproche du Sporophore adverse le plus proche.
const MORTAR_FALLBACK: int = 1_000


## Rang du type de bâtiment que le robot veut poser ensuite (−1 : aucun débloqué ou voulu).
static func wanted_type(state: GameState, colony: ColonyState, profile: RobotProfile) -> int:
	var counts := PackedInt32Array()
	counts.resize(state.defs.buildings.size())
	for building: BuildingState in Buildings.of_colony(state, colony.id):
		counts[building.type] += 1
	var best: int = -1
	var best_score: int = 0
	for type: int in range(state.defs.buildings.size()):
		var def: SimBuilding = state.defs.buildings[type]
		var weight: int = profile.building_weight(def.id)
		if weight <= 0 or colony.tier < def.unlock_tier:
			continue
		@warning_ignore("integer_division")
		var score: int = weight * 1000 / (1 + counts[type])
		if score > best_score:
			best = type
			best_score = score
	return best


## Enzymes que le robot garde pour son prochain bâtiment (0 : aucune place libre ni démolition
## prévue). Les capacités n'utilisent que le reste.
static func reserve(state: GameState, colony: ColonyState, profile: RobotProfile) -> int:
	var type: int = wanted_type(state, colony, profile)
	if type < 0:
		return 0
	var slots: int = ColonyStats.building_slots(state.defs, colony)
	if Buildings.standing_count(state, colony.id) >= slots and _idle(state, colony) == null:
		return 0
	return Fixed.from_units(state.defs.buildings[type].cost_enzymes)


## Prix d'une pose, en millièmes d'Enzymes.
static func cost_of(state: GameState, command: BuildCommand) -> int:
	var type: int = state.defs.building_index(command.building)
	return Fixed.from_units(state.defs.buildings[type].cost_enzymes) if type >= 0 else 0


## Commande de bâtiment du robot à ce tick (null : rien à faire) : une pose, ou la démolition
## d'un bâtiment inutile quand toutes les places sont prises et que le suivant est payable.
static func plan(state: GameState, colony: ColonyState, profile: RobotProfile) -> Command:
	if colony.turret < 0:
		return null
	var type: int = wanted_type(state, colony, profile)
	if type < 0:
		return null
	var def: SimBuilding = state.defs.buildings[type]
	if colony.enzymes < Fixed.from_units(def.cost_enzymes):
		return null
	var slots: int = ColonyStats.building_slots(state.defs, colony)
	if Buildings.standing_count(state, colony.id) >= slots:
		var idle: BuildingState = _idle(state, colony)
		if idle == null:
			return null
		return DemolishCommand.new(state.map.cells[idle.cell], colony.id)
	var cell: int = best_cell(state, colony, profile, type)
	if cell < 0:
		return null
	return BuildCommand.new(def.id, state.map.cells[cell], colony.id)


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


## Premier Essaimeur ou Avant-poste actif qui n'a plus aucune case à viser (null : aucun).
static func _idle(state: GameState, colony: ColonyState) -> BuildingState:
	for building: BuildingState in Buildings.of_colony(state, colony.id):
		if not building.active(state.tick):
			continue
		if state.defs.buildings[building.type].kind == BuildingDef.Kind.MORTAR:
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
