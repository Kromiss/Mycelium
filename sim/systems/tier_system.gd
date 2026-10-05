class_name TierSystem
extends RefCounted
## Étape 5 du tick : paliers de colonie (GDD §8.3, §10). Le palier suit le nombre de cases
## actuel (il peut redescendre). La première fois qu'un palier est atteint, la colonie reçoit
## son lot d'Enzymes et un choix de mutations ; les choix non faits s'empilent (décidé le
## 4 octobre 2026) et la partie continue pendant le choix.


func run(state: GameState, result: TickResult) -> void:
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var tier: int = ColonyStats.tier_for(state.defs, colony.cell_count)
		for reached: int in range(tier):
			if colony.tier_ticks[reached] < 0:
				_first_reach(state, colony, reached + 1, result)
		if tier != colony.tier:
			result.tier_changes.append_array(PackedInt32Array([colony.id, colony.tier, tier]))
			result.colony_changed(colony.id)
			colony.tier = tier


## Raison pour laquelle le choix serait refusé (OK s'il serait accepté) : « choice » est le
## rang d'une mutation du premier choix en attente.
static func check_choose(state: GameState, colony: ColonyState, choice: int) -> Refusal.Code:
	var choices: int = state.defs.mutation_choices
	if colony.pending_offers.is_empty():
		return Refusal.Code.NO_MUTATION_OFFER
	if choice < 0 or choice >= choices or colony.pending_offers[choice] < 0:
		return Refusal.Code.UNKNOWN_MUTATION
	return Refusal.Code.OK


## Prend la mutation choisie dans le premier choix en attente.
static func choose(state: GameState, colony: ColonyState, choice: int) -> void:
	var choices: int = state.defs.mutation_choices
	colony.mutations.append(colony.pending_offers[choice])
	colony.mutation_tiers.append(colony.pending_tiers[0])
	colony.pending_offers = colony.pending_offers.slice(choices)
	colony.pending_tiers = colony.pending_tiers.slice(1)


func _first_reach(state: GameState, colony: ColonyState, tier: int, result: TickResult) -> void:
	colony.tier_ticks[tier - 1] = state.tick
	colony.enzymes += ColonyStats.tier_enzymes(state.defs, colony, tier)
	var offer: PackedInt32Array = _draw_offer(state, colony)
	if not offer.is_empty():
		colony.pending_offers.append_array(offer)
		colony.pending_tiers.append(tier)
		result.mutation_offers.append(colony.id)
	result.colony_changed(colony.id)


## Tire les mutations proposées, sans remise, parmi celles ni prises ni déjà proposées ;
## complète par −1 s'il en reste moins que de choix (vide s'il n'en reste aucune).
func _draw_offer(state: GameState, colony: ColonyState) -> PackedInt32Array:
	var available := PackedInt32Array()
	for index: int in range(state.defs.mutations.size()):
		if not colony.has_mutation(index) and not colony.pending_offers.has(index):
			available.append(index)
	var offer := PackedInt32Array()
	if available.is_empty():
		return offer
	for i: int in range(state.defs.mutation_choices):
		if available.is_empty():
			offer.append(-1)
			continue
		var pick: int = state.rng.range_int(available.size())
		offer.append(available[pick])
		available.remove_at(pick)
	return offer
