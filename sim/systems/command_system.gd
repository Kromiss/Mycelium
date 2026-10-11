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


## Raison pour laquelle la commande serait refusée maintenant (OK si elle serait acceptée).
static func check(state: GameState, command: Command) -> Refusal.Code:
	var colony: ColonyState = state.colony(command.colony_id)
	if colony == null or not colony.alive:
		return Refusal.Code.UNKNOWN_COLONY
	if state.finished:
		return Refusal.Code.GAME_OVER
	match command.type:
		Command.Type.HOTSPOT:
			var cell: int = _cell(state, command)
			if cell < 0:
				return Refusal.Code.OUT_OF_MAP
			if state.owner[cell] == colony.id:
				return Refusal.Code.OWN_CELL
			return Refusal.Code.OK
		Command.Type.BUY_UPGRADE:
			var id: StringName = (command as BuyUpgradeCommand).upgrade
			return Upgrades.check_buy(state, colony, state.defs.upgrade_index(id))
		Command.Type.CHOOSE_MUTATION:
			var choice: int = (command as ChooseMutationCommand).choice
			return TierSystem.check_choose(state, colony, choice)
	return Refusal.Code.UNKNOWN_COMMAND


func _apply(state: GameState, command: Command, result: TickResult) -> Refusal.Code:
	var code: Refusal.Code = check(state, command)
	if code != Refusal.Code.OK:
		return code
	var colony: ColonyState = state.colony(command.colony_id)
	match command.type:
		Command.Type.HOTSPOT:
			_toggle_hotspot(state, colony, _cell(state, command))
		Command.Type.BUY_UPGRADE:
			var buy := command as BuyUpgradeCommand
			Upgrades.buy(state, colony, state.defs.upgrade_index(buy.upgrade), buy.count)
		Command.Type.CHOOSE_MUTATION:
			TierSystem.choose(state, colony, (command as ChooseMutationCommand).choice)
	result.colony_changed(colony.id)
	return Refusal.Code.OK


## Pose un point chaud sur la case, ou le retire s'il y en a déjà un ; au-delà du maximum
## permis par le palier, le plus ancien est remplacé (GDD §5 bis.3, §5 bis.6).
static func _toggle_hotspot(state: GameState, colony: ColonyState, cell: int) -> void:
	var position: int = colony.hotspots.find(cell)
	if position >= 0:
		colony.hotspots.remove_at(position)
		return
	colony.hotspots.append(cell)
	trim_hotspots(state.defs, colony)


## Retire les points chauds les plus anciens au-delà du maximum permis par le palier.
static func trim_hotspots(defs: SimDefs, colony: ColonyState) -> void:
	var excess: int = colony.hotspots.size() - ColonyStats.max_hotspots(defs, colony)
	if excess > 0:
		colony.hotspots = colony.hotspots.slice(excess)


## Case visée par une commande (−1 hors de la forêt, ou si la commande ne vise pas de case).
static func _cell(state: GameState, command: Command) -> int:
	if not command is CellCommand:
		return -1
	return state.map.index_of((command as CellCommand).cell)


## Tri stable : par colonie, puis dans l'ordre d'arrivée.
static func _sorted(commands: Array[Command]) -> Array[Command]:
	var sorted: Array[Command] = []
	for command: Command in commands:
		var position: int = sorted.size()
		while position > 0 and sorted[position - 1].colony_id > command.colony_id:
			position -= 1
		sorted.insert(position, command)
	return sorted
