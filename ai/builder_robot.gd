class_name BuilderRobot
extends RefCounted
## Profil de bâtisseur d'un robot (GDD §14.5, décidé le 4 octobre 2026) : quel bâtiment poser
## ensuite et sur quelle case. Il lit l'état sans le modifier.
## - Producteur : Nœuds de digestion sur les cases où ils rapportent le plus (voisinage et Rosace
##   compris) ; dès que les Glandes sont débloquées, une Glande (collée aux autres) pour trois
##   Nœuds ;
## - Accélérateur : d'abord les Pépinières qui donnent tous les chantiers possibles, puis les
##   Mycorhizes qui donnent toutes les pousses possibles, ensuite comme le Producteur ;
## - Hasardeux : un type débloqué qu'il peut payer, tiré au hasard, posé sur la meilleure case ;
## - Producteur et Accélérateur posent d'abord un Grenier quand le stock dépasse 80 % du plafond.
## Une Pépinière va sur la case qui couvre le plus de cases colonisables pas encore couvertes ;
## un Grenier ou une Mycorhize, sur la case où un Nœud rapporterait le moins.

enum Profile { NONE, PRODUCER, ACCELERATOR, RANDOM }

## Clés de traduction des noms de profil, dans l'ordre de Profile.
const PROFILE_KEYS: Array[String] = [
	"BUILDER_NONE", "BUILDER_PRODUCER", "BUILDER_ACCELERATOR", "BUILDER_RANDOM"
]
## Identifiants des bâtiments que les profils connaissent.
const NODE: StringName = &"digestion_node"
const GRANARY: StringName = &"granary"
const NURSERY: StringName = &"nursery"
const GLAND: StringName = &"enzyme_gland"
const MYCORRHIZA: StringName = &"mycorrhiza"
## Stock (pour-mille du plafond) à partir duquel le prochain bâtiment est un Grenier.
const GRANARY_STOCK_PM: int = 800
## Nombre de Nœuds par Glande pour le Producteur.
const NODES_PER_GLAND: int = 3

var profile: Profile = Profile.NONE
var _rng: SimRng


func _init(builder_profile: Profile, rng: SimRng) -> void:
	profile = builder_profile
	_rng = rng


## Type du prochain bâtiment voulu (−1 : aucun). « budget » : ce que le robot peut dépenser
## (le profil Hasardeux ne tire que parmi les types qu'il peut payer).
func wanted_type(state: GameState, colony: ColonyState, budget: int) -> int:
	match profile:
		Profile.PRODUCER:
			return _producer_type(state, colony, true)
		Profile.ACCELERATOR:
			return _accelerator_type(state, colony)
		Profile.RANDOM:
			return _random_type(state, colony, budget)
	return -1


## Meilleure case pour un type de bâtiment (−1 : aucune).
func best_cell(state: GameState, colony: ColonyState, type: int) -> int:
	var candidates: PackedInt32Array = _candidates(state, colony, type)
	if candidates.is_empty():
		return -1
	var building: SimBuilding = state.defs.buildings[type]
	if building.yield_bonus_pm > 0:
		return _best(
			candidates, func(cell: int) -> float: return node_gain(state, colony, cell, type)
		)
	if building.enzymes_per_minute > 0:
		return _best(
			candidates, func(cell: int) -> float: return gland_gain(state, colony, cell, type)
		)
	if building.effect_radius > 0 and building.growth_reduction_pm > 0:
		return _best(
			candidates, func(cell: int) -> float: return float(coverage(state, colony, cell, type))
		)
	# Effet indépendant de la case : là où un Nœud rapporterait le moins.
	var node: int = state.defs.building_index(NODE)
	if node < 0:
		return candidates[0]
	return _best(candidates, func(cell: int) -> float: return -node_gain(state, colony, cell, node))


## Production ajoutée (millièmes par seconde, avant palier) si un bâtiment de rendement de ce type
## était posé sur la case : la case elle-même, plus le voisinage gagné par les bâtiments actifs du
## même type autour d'elle.
static func node_gain(state: GameState, colony: ColonyState, cell: int, type: int) -> float:
	var building: SimBuilding = state.defs.buildings[type]
	var gain: float = 0.0
	if state.connected[cell] == 1:
		var base: float = float(EconomySystem.cell_production(state, colony.id, cell))
		var synergy: int = Buildings.synergy_with(state, colony.id, cell, type, 0)
		var factor: float = (Fixed.ONE + building.yield_bonus_pm) * synergy / 1_000_000.0
		gain += base * (factor - 1.0)
	for other: int in _same_neighbors(state, colony, cell, type):
		var before: int = Buildings.synergy_with(state, colony.id, other, type, 0)
		var after: int = Buildings.synergy_with(state, colony.id, other, type, 1)
		var production: float = float(EconomySystem.cell_production(state, colony.id, other))
		gain += production * (float(after) / float(maxi(1, before)) - 1.0)
	return gain


## Enzymes par minute ajoutées si une Glande de ce type était posée sur la case.
static func gland_gain(state: GameState, colony: ColonyState, cell: int, type: int) -> float:
	var per_minute: float = float(state.defs.buildings[type].enzymes_per_minute)
	var gain: float = 0.0
	if state.connected[cell] == 1:
		gain += per_minute * Buildings.synergy_with(state, colony.id, cell, type, 0) / Fixed.ONE
	for other: int in _same_neighbors(state, colony, cell, type):
		if state.connected[other] == 0:
			continue
		var before: int = Buildings.synergy_with(state, colony.id, other, type, 0)
		var after: int = Buildings.synergy_with(state, colony.id, other, type, 1)
		gain += per_minute * (after - before) / Fixed.ONE
	return gain


## Cases libres à portée de la case que ne couvre encore aucune Pépinière de la colonie.
static func coverage(state: GameState, colony: ColonyState, cell: int, type: int) -> int:
	var reach: int = state.defs.buildings[type].effect_radius
	var origin: Vector2i = state.map.cells[cell]
	var placed := PackedInt32Array()
	for other: int in range(state.cell_count()):
		if state.building[other] == type and state.owner[other] == colony.id:
			placed.append(other)
	var count: int = 0
	for other: int in range(state.cell_count()):
		if state.cell_state[other] != GameState.CellState.FREE:
			continue
		var coords: Vector2i = state.map.cells[other]
		if Hex.distance(origin, coords) > reach:
			continue
		var covered: bool = false
		for nursery: int in placed:
			if Hex.distance(state.map.cells[nursery], coords) <= reach:
				covered = true
				break
		if not covered:
			count += 1
	return count


## Nombre de bâtiments d'un type (par identifiant) que possède la colonie (file comprise).
static func count_of(state: GameState, colony: ColonyState, id: StringName) -> int:
	var type: int = state.defs.building_index(id)
	return Buildings.count_of(state, colony, type) if type >= 0 else 0


# --- Choix du type ---


func _producer_type(state: GameState, colony: ColonyState, granary_first: bool) -> int:
	if granary_first:
		var granary: int = _granary_if_full(state, colony)
		if granary >= 0:
			return granary
	var gland: int = _unlocked(state, colony, GLAND)
	if (
		gland >= 0
		and count_of(state, colony, GLAND) * NODES_PER_GLAND < count_of(state, colony, NODE)
	):
		return gland
	return _unlocked(state, colony, NODE)


func _accelerator_type(state: GameState, colony: ColonyState) -> int:
	var granary: int = _granary_if_full(state, colony)
	if granary >= 0:
		return granary
	var defs: SimDefs = state.defs
	var nursery: int = _unlocked(state, colony, NURSERY)
	if nursery >= 0:
		var wanted: int = _needed(
			defs.max_build_sites - defs.base_build_sites, defs.buildings[nursery].extra_sites
		)
		if count_of(state, colony, NURSERY) < wanted:
			return nursery
	var mycorrhiza: int = _unlocked(state, colony, MYCORRHIZA)
	if mycorrhiza >= 0:
		var wanted: int = _needed(
			defs.max_growths_cap - defs.max_growths, defs.buildings[mycorrhiza].extra_growths
		)
		if count_of(state, colony, MYCORRHIZA) < wanted:
			return mycorrhiza
	return _producer_type(state, colony, false)


func _random_type(state: GameState, colony: ColonyState, budget: int) -> int:
	var types: Array[int] = []
	for type: int in range(state.defs.buildings.size()):
		if not Buildings.is_unlocked(state, colony, type):
			continue
		if Buildings.cost(state, colony, type) > budget:
			continue
		if Buildings.enzyme_cost(state, type) > colony.enzymes:
			continue
		types.append(type)
	if types.is_empty():
		return -1
	return types[_rng.range_int(types.size())]


## Le Grenier s'il est débloqué et que le stock dépasse 80 % du plafond (−1 sinon).
func _granary_if_full(state: GameState, colony: ColonyState) -> int:
	var granary: int = _unlocked(state, colony, GRANARY)
	if granary < 0 or colony.stock_cap <= 0:
		return -1
	if colony.nutrients * Fixed.ONE >= colony.stock_cap * GRANARY_STOCK_PM:
		return granary
	return -1


## Index du type s'il existe et que la colonie l'a débloqué (−1 sinon).
static func _unlocked(state: GameState, colony: ColonyState, id: StringName) -> int:
	var type: int = state.defs.building_index(id)
	if type < 0 or not Buildings.is_unlocked(state, colony, type):
		return -1
	return type


## Nombre de bâtiments qui donnent « missing » avec « per_building » chacun.
static func _needed(missing: int, per_building: int) -> int:
	if missing <= 0 or per_building <= 0:
		return 0
	@warning_ignore("integer_division")
	return (missing + per_building - 1) / per_building


# --- Choix de la case ---


## Cases poussées de la colonie, sans bâtiment, hors Cœur, où la règle de pose accepte le type.
static func _candidates(state: GameState, colony: ColonyState, type: int) -> PackedInt32Array:
	var result := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if cell == colony.heart or state.building[cell] >= 0:
			continue
		if not state.is_owned_by(cell, colony.id):
			continue
		if Buildings.placement_ok(state, colony, cell, type):
			result.append(cell)
	return result


## Voisines de la colonie qui portent un bâtiment actif de ce type.
static func _same_neighbors(
	state: GameState, colony: ColonyState, cell: int, type: int
) -> PackedInt32Array:
	var result := PackedInt32Array()
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		if other >= 0 and state.owner[other] == colony.id and state.active_building(other) == type:
			result.append(other)
	return result


## Case au meilleur score ; à égalité, la première par numéro.
static func _best(candidates: PackedInt32Array, score: Callable) -> int:
	var best: int = -1
	var best_score: float = -INF
	for cell: int in candidates:
		var value: float = score.call(cell)
		if value > best_score:
			best_score = value
			best = cell
	return best
