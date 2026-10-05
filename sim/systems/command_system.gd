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
		Command.Type.TARGET:
			return Targeting.check_target(state, colony, _cell(state, command))
		Command.Type.SET_PRIORITY:
			var priority: int = (command as SetPriorityCommand).priority
			if not ColonyState.Priority.values().has(priority):
				return Refusal.Code.UNKNOWN_PRIORITY
			return Refusal.Code.OK
		Command.Type.BUY_UPGRADE:
			var id: StringName = (command as BuyUpgradeCommand).upgrade
			return Upgrades.check_buy(state, colony, state.defs.upgrade_index(id))
		Command.Type.CHOOSE_MUTATION:
			var choice: int = (command as ChooseMutationCommand).choice
			return TierSystem.check_choose(state, colony, choice)
		Command.Type.USE_ABILITY:
			var ability: int = state.defs.ability_index((command as UseAbilityCommand).ability)
			return Abilities.check_use(state, colony, ability, _cell(state, command))
	return Refusal.Code.UNKNOWN_COMMAND


func _apply(state: GameState, command: Command, result: TickResult) -> Refusal.Code:
	var code: Refusal.Code = check(state, command)
	if code != Refusal.Code.OK:
		return code
	var colony: ColonyState = state.colony(command.colony_id)
	match command.type:
		Command.Type.TARGET:
			colony.designated = _cell(state, command)
			colony.targets.erase(colony.designated)
		Command.Type.SET_PRIORITY:
			# Nouvelle priorité : les cibles gardées sont lâchées, la cible désignée reste.
			colony.priority = (command as SetPriorityCommand).priority
			colony.targets = PackedInt32Array()
		Command.Type.BUY_UPGRADE:
			var buy := command as BuyUpgradeCommand
			Upgrades.buy(state, colony, state.defs.upgrade_index(buy.upgrade), buy.count)
		Command.Type.CHOOSE_MUTATION:
			TierSystem.choose(state, colony, (command as ChooseMutationCommand).choice)
		Command.Type.USE_ABILITY:
			var use := command as UseAbilityCommand
			var ability: int = state.defs.ability_index(use.ability)
			Abilities.use(state, colony, ability, _cell(state, command), result)
	result.colony_changed(colony.id)
	return Refusal.Code.OK


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
