class_name Abilities
extends RefCounted
## Capacités actives (GDD §11) : Salve, Mur de mycélium, Nuage toxique. Payées en Enzymes,
## avec une recharge, débloquées par un palier, interdites pendant la protection de départ.


## Raison pour laquelle la capacité serait refusée (OK si elle serait acceptée). « cell » :
## case choisie (centre du Mur, case visée par le Nuage ; ignorée par la Salve).
static func check_use(state: GameState, colony: ColonyState, index: int, cell: int) -> Refusal.Code:
	if index < 0 or index >= state.defs.abilities.size():
		return Refusal.Code.UNKNOWN_ABILITY
	var ability: SimAbility = state.defs.abilities[index]
	if colony.tier < ability.unlock_tier:
		return Refusal.Code.TIER_LOCKED
	if not state.protection_over():
		return Refusal.Code.PROTECTED
	if state.tick < colony.ability_ready[index]:
		return Refusal.Code.COOLDOWN
	if colony.enzymes < Fixed.from_units(ability.cost_enzymes):
		return Refusal.Code.NOT_ENOUGH_ENZYMES
	if ability.kind != AbilityDef.Kind.SALVO and cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if ability.kind == AbilityDef.Kind.CLOUD and not Targeting.in_range(state, colony, cell):
		return Refusal.Code.OUT_OF_RANGE
	return Refusal.Code.OK


## Lance la capacité (déjà vérifiée) : paie, démarre la recharge et applique l'effet.
static func use(
	state: GameState, colony: ColonyState, index: int, cell: int, result: TickResult
) -> void:
	var ability: SimAbility = state.defs.abilities[index]
	colony.enzymes -= Fixed.from_units(ability.cost_enzymes)
	colony.ability_ready[index] = state.tick + ability.cooldown_ticks
	match ability.kind:
		AbilityDef.Kind.SALVO:
			colony.salvo_until = state.tick + ability.duration_ticks
			colony.salvo_rate_pm = ability.rate_pm
		AbilityDef.Kind.WALL:
			colony.wall_center = cell
			colony.wall_radius = ability.radius
			colony.wall_until = state.tick + ability.duration_ticks
		AbilityDef.Kind.CLOUD:
			_cloud(state, colony, ability, cell, result)
	result.abilities.append_array(PackedInt32Array([colony.id, index, cell]))
	result.colony_changed(colony.id)


## Nuage toxique : la case et ses voisines (rayon de la capacité) qui ne sont pas à la colonie
## prennent les dégâts de « shots » tirs et ne se régénèrent plus pendant l'effet.
static func _cloud(
	state: GameState, colony: ColonyState, ability: SimAbility, cell: int, result: TickResult
) -> void:
	for other: int in state.map.disk(cell, ability.radius):
		if state.owner[other] == colony.id:
			continue
		var victim: ColonyState = state.owner_of(other)
		if victim == null or not Combat.is_walled(state, victim, other):
			state.no_regen_until[other] = maxi(
				state.no_regen_until[other], state.tick + ability.duration_ticks
			)
		var amount: int = ColonyStats.damage_on(state, colony, other) * ability.shots
		Combat.deal(state, colony, other, amount, result)
