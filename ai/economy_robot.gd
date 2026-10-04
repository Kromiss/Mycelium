class_name EconomyRobot
extends RefCounted
## Profil d'expansion d'un robot (GDD §14.5, Architecture §6) : quelle case ajouter à la file
## d'expansion. Depuis G2, le robot (ColonyRobot) n'ajoute la case choisie que si sa bourse
## d'expansion couvre son coût (décidé le 4 octobre 2026). Il lit l'état sans le modifier.

enum Profile {
	## Une case tirée au hasard parmi les 3 plus rentables.
	RANDOM,
	## Le meilleur rapport production ajoutée / coût.
	PROFITABLE,
	## Le remboursement le plus court, durée de pousse comprise.
	FAST,
	## La case la plus riche qu'il peut payer.
	CENTER,
}

## Nombre de cases parmi lesquelles le profil Hasardeux tire au sort.
const RANDOM_POOL: int = 3
## Clés de traduction des noms de profil, dans l'ordre de Profile.
const PROFILE_KEYS: Array[String] = [
	"PROFILE_RANDOM", "PROFILE_PROFITABLE", "PROFILE_FAST", "PROFILE_CENTER"
]

var profile: Profile = Profile.PROFITABLE
var colony_id: int = 0
## Nombre de cases candidates au dernier choix (0 : plus rien à coloniser).
var last_candidate_count: int = 0

var _rng: SimRng


## Robot d'un profil pour une colonie. Son aléatoire est dérivé de la graine de la partie.
func _init(robot_profile: Profile, colony: int, game_seed: int) -> void:
	profile = robot_profile
	colony_id = colony
	_rng = SimRng.new(game_seed).derive(colony + 1)


## Case choisie par le profil parmi celles qui peuvent entrer dans la file (−1 : aucune).
## « budget » : ce que le robot peut dépenser (le profil Centre prend la case la plus riche
## qu'il peut payer) ; −1 : le stock de la colonie.
func choose(state: GameState, colony: ColonyState, budget: int = -1) -> int:
	var candidates: PackedInt32Array = _candidates(state, colony)
	last_candidate_count = candidates.size()
	if candidates.is_empty():
		return -1
	match profile:
		Profile.CENTER:
			var money: int = colony.nutrients if budget < 0 else budget
			return _richest_affordable(state, colony, candidates, money)
		Profile.FAST:
			return _best(state, colony, candidates, _payback_score)
		Profile.RANDOM:
			return _random_among_best(state, colony, candidates)
		_:
			return _best(state, colony, candidates, _ratio_score)


## Cases libres qui peuvent entrer dans la file, par ordre de numéro.
func _candidates(state: GameState, colony: ColonyState) -> PackedInt32Array:
	var result := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if state.cell_state[cell] != GameState.CellState.FREE:
			continue
		# Tri rapide : seules les cases collées à la colonie (ou à sa file) peuvent convenir.
		if not _touches_colony(state, colony, cell):
			continue
		if Expansion.check_enqueue(state, colony, cell) == Refusal.Code.OK:
			result.append(cell)
	return result


func _touches_colony(state: GameState, colony: ColonyState, cell: int) -> bool:
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		if other >= 0 and (state.owner[other] == colony.id or colony.queue.has(other)):
			return true
	return false


## Rentabilité : production ajoutée par nutriment dépensé (plus c'est grand, mieux c'est).
func _ratio_score(state: GameState, colony: ColonyState, cell: int) -> float:
	var cost: int = maxi(1, Expansion.cost(state, colony, cell))
	return float(EconomySystem.added_production(state, colony.id, cell)) / float(cost)


## Remboursement : secondes de pousse + secondes pour rembourser le coût (on prend l'opposé,
## pour que le plus grand score reste le meilleur).
func _payback_score(state: GameState, colony: ColonyState, cell: int) -> float:
	var added: int = maxi(1, EconomySystem.added_production(state, colony.id, cell))
	var payback: float = float(Expansion.cost(state, colony, cell)) / float(added)
	return -(payback + float(Expansion.growth_ticks(state, cell)))


## Meilleure case selon un score ; à égalité, la première par numéro.
func _best(
	state: GameState, colony: ColonyState, candidates: PackedInt32Array, score: Callable
) -> int:
	var best: int = -1
	var best_score: float = -INF
	for cell: int in candidates:
		var value: float = score.call(state, colony, cell)
		if value > best_score:
			best_score = value
			best = cell
	return best


func _random_among_best(state: GameState, colony: ColonyState, candidates: PackedInt32Array) -> int:
	var ranked: Array[int] = []
	var scores: Dictionary[int, float] = {}
	for cell: int in candidates:
		scores[cell] = _ratio_score(state, colony, cell)
		ranked.append(cell)
	# Tri stable par score décroissant, puis par numéro de case.
	ranked.sort_custom(
		func(a: int, b: int) -> bool:
			return scores[a] > scores[b] or (scores[a] == scores[b] and a < b)
	)
	var pool: int = mini(RANDOM_POOL, ranked.size())
	return ranked[_rng.range_int(pool)]


## La case la plus riche que le robot peut payer tout de suite ; à richesse égale, la plus
## rentable. −1 s'il ne peut rien payer.
func _richest_affordable(
	state: GameState, colony: ColonyState, candidates: PackedInt32Array, money: int
) -> int:
	var best: int = -1
	var best_richness: int = -1
	var best_ratio: float = -INF
	for cell: int in candidates:
		if Expansion.cost(state, colony, cell) > money:
			continue
		var richness: int = state.defs.zone_richness_pm[state.map.zones[cell] - 1]
		var ratio: float = _ratio_score(state, colony, cell)
		if richness > best_richness or (richness == best_richness and ratio > best_ratio):
			best = cell
			best_richness = richness
			best_ratio = ratio
	return best
