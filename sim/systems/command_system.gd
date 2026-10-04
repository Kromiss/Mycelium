class_name CommandSystem
extends RefCounted
## Étape 1 du tick : trie les commandes (colonie, puis ordre d'arrivée), les valide, applique
## celles qui sont valides et note les autres avec leur raison de refus.


## Applique les commandes du tick, dans un ordre fixe.
func run(state: GameState, commands: Array[Command], result: TickResult) -> void:
	for command: Command in _sorted(commands):
		command.tick = state.tick
		var code: Refusal.Code = _apply(state, command, result)
		if code != Refusal.Code.OK:
			result.refuse(command, code)


func _apply(state: GameState, command: Command, result: TickResult) -> Refusal.Code:
	var colony: ColonyState = state.colony(command.colony_id)
	if colony == null or not colony.alive:
		return Refusal.Code.UNKNOWN_COLONY
	if not command is CellCommand:
		return Refusal.Code.UNKNOWN_COMMAND
	var cell: int = state.map.index_of((command as CellCommand).cell)
	var code: Refusal.Code = Refusal.Code.UNKNOWN_COMMAND
	match command.type:
		Command.Type.COLONIZE:
			code = Expansion.check_colonize(state, colony, cell)
			if code == Refusal.Code.OK:
				Expansion.start_growth(state, colony, cell, result)
		Command.Type.ENQUEUE:
			code = Expansion.check_enqueue(state, colony, cell)
			if code == Refusal.Code.OK:
				colony.queue.append(cell)
				result.colony_changed(colony.id)
		Command.Type.DEQUEUE:
			code = Expansion.check_dequeue(colony, cell)
			if code == Refusal.Code.OK:
				Expansion.dequeue(state, colony, cell)
				result.colony_changed(colony.id)
	return code


## Tri stable : par colonie, puis dans l'ordre d'arrivée.
static func _sorted(commands: Array[Command]) -> Array[Command]:
	var sorted: Array[Command] = []
	for command: Command in commands:
		var position: int = sorted.size()
		while position > 0 and sorted[position - 1].colony_id > command.colony_id:
			position -= 1
		sorted.insert(position, command)
	return sorted
