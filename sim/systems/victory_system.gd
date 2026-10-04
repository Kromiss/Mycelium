class_name VictorySystem
extends RefCounted
## Étape 7 du tick : fin de partie. En G1, seule la durée maximale (30 min) arrête la partie ;
## l'élimination et le départage arrivent en G3.


## Termine la partie quand « tick » (le nombre de ticks joués) atteint la durée maximale.
func run(state: GameState, ticks_played: int, result: TickResult) -> void:
	if ticks_played >= state.defs.match_ticks:
		state.finished = true
		result.finished = true
