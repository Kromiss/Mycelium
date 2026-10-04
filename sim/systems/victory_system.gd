class_name VictorySystem
extends RefCounted
## Étape 6 du tick : fin de partie (GDD §3.3). La partie s'arrête quand il ne reste qu'une
## colonie en vie (s'il y en avait au moins deux), ou à la durée maximale. Le classement met
## les colonies en vie d'abord (éliminations, puis production moyenne, puis cases), puis les
## éliminées de la dernière à la première (à égalité de tick : production moyenne, puis cases).


## Termine la partie si besoin ; « ticks_played » est le nombre de ticks joués, celui-ci compris.
func run(state: GameState, ticks_played: int, result: TickResult) -> void:
	var last_standing: bool = state.start_colonies >= 2 and state.alive_count() <= 1
	if last_standing or ticks_played >= state.defs.match_ticks:
		state.finished = true
		state.ranking = ranking(state)
		result.finished = true


## Classement des colonies, la meilleure en premier. La production moyenne sur la partie se
## compare par la Biomasse : toutes les colonies sont mesurées sur la même durée.
static func ranking(state: GameState) -> PackedInt32Array:
	var keys: Array[PackedInt64Array] = []
	for colony: ColonyState in state.colonies:
		var survival: int = 0 if colony.alive else -colony.eliminated_tick
		(
			keys
			. append(
				PackedInt64Array(
					[
						0 if colony.alive else 1,
						survival,
						-colony.trophies if colony.alive else 0,
						-colony.biomass,
						-colony.cell_count,
						colony.id,
					]
				)
			)
		)
	keys.sort_custom(_before)
	var order := PackedInt32Array()
	for key: PackedInt64Array in keys:
		order.append(key[key.size() - 1])
	return order


static func _before(a: PackedInt64Array, b: PackedInt64Array) -> bool:
	for i: int in range(a.size()):
		if a[i] != b[i]:
			return a[i] < b[i]
	return false
