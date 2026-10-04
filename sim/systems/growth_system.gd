class_name GrowthSystem
extends RefCounted
## Étape 2 du tick : démarre les cases de la file d'expansion qui le peuvent, puis fait
## avancer toutes les pousses d'un tick. Une case poussée rejoint le réseau à la fin du tick.


func run(state: GameState, result: TickResult) -> void:
	var completed: bool = false
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		Expansion.start_queued(state, colony, result)
		if _advance(state, colony, result):
			completed = true
	if completed:
		state.recompute_network()


## Avance les pousses de la colonie ; vrai si au moins une est terminée.
func _advance(state: GameState, colony: ColonyState, result: TickResult) -> bool:
	var still_growing := PackedInt32Array()
	var completed: bool = false
	for cell: int in colony.growing:
		state.growth_left[cell] -= 1
		result.cell_changed(cell)
		if state.growth_left[cell] > 0:
			still_growing.append(cell)
			continue
		state.cell_state[cell] = GameState.CellState.OWNED
		colony.cell_count += 1
		var zone: int = state.map.zones[cell] - 1
		if colony.zone_ticks[zone] < 0:
			colony.zone_ticks[zone] = state.tick
		completed = true
		result.growth_completed.append_array(PackedInt32Array([colony.id, cell]))
		result.colony_changed(colony.id)
	colony.growing = still_growing
	return completed
