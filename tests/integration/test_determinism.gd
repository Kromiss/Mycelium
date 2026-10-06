extends GutTest
## Déterminisme et rejeu (Architecture §4.4, §11.2) : même graine + mêmes commandes = même
## partie, au bit près ; une partie enregistrée se rejoue à l'identique.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
## Seuil de sécurité des grands nombres (Architecture §4.5), loin de la limite d'un int 64 bits.
const SAFE_LIMIT: int = 1_000_000_000_000_000


## Joue une partie où chaque colonie donne des ordres au hasard (aléatoire du script, dérivé
## par colonie) : améliorations, priorités, cibles, pas, mutations et capacités. Renvoie les
## empreintes de chaque tick.
func _play(transport: LocalTransport, ticks: int, script_seed: int) -> PackedInt64Array:
	var simulation: Simulation = transport.simulation
	var rngs: Array[SimRng] = []
	for colony: ColonyState in simulation.state.colonies:
		rngs.append(SimRng.new(script_seed).derive(colony.id))
	var hashes := PackedInt64Array()
	var results: Array[TickResult] = []
	var on_tick: Callable = func(result: TickResult) -> void: results.append(result)
	transport.tick_received.connect(on_tick)
	for tick: int in range(ticks):
		for colony: ColonyState in simulation.state.colonies:
			for command: Command in _random_commands(simulation, colony, rngs[colony.id]):
				transport.send_command(command)
		transport.advance()
		hashes.append(results[results.size() - 1].state_hash)
	transport.tick_received.disconnect(on_tick)
	return hashes


func _random_commands(simulation: Simulation, colony: ColonyState, rng: SimRng) -> Array[Command]:
	var state: GameState = simulation.state
	var commands: Array[Command] = []
	if not colony.alive:
		return commands
	var upgrades: Array[SimUpgrade] = state.defs.upgrades
	commands.append(BuyUpgradeCommand.new(upgrades[rng.range_int(upgrades.size())].id, 1))
	match rng.range_int(12):
		0:
			commands.append(SetPriorityCommand.new(rng.range_int(4)))
		1:
			commands.append(TargetCommand.new(_random_cell_near(state, colony, rng)))
		3:
			commands.append(ChooseMutationCommand.new(rng.range_int(3)))
		4:
			var abilities: Array[SimAbility] = state.defs.abilities
			var ability: StringName = abilities[rng.range_int(abilities.size())].id
			commands.append(UseAbilityCommand.new(ability, _random_cell_near(state, colony, rng)))
	for command: Command in commands:
		command.colony_id = colony.id
	return commands


## Une case au hasard à 4 cases ou moins de la Tourelle.
func _random_cell_near(state: GameState, colony: ColonyState, rng: SimRng) -> Vector2i:
	var cells: PackedInt32Array = state.map.disk(colony.turret, 4)
	return state.map.cells[cells[rng.range_int(cells.size())]]


func _transport(mode: ModeDef, game_seed: int, colonies: int = -1) -> LocalTransport:
	var defs: SimDefs = SimDefs.from_mode(mode)
	defs.protection_ticks = 20
	var count: int = defs.sectors if colonies < 0 else colonies
	return LocalTransport.new(
		Simulation.new(defs, game_seed, count), Replay.new(defs, game_seed, count)
	)


func test_same_seed_and_commands_give_the_same_hash_every_tick() -> void:
	var first: PackedInt64Array = _play(_transport(FFA, 7), 120, 3)
	var second: PackedInt64Array = _play(_transport(FFA, 7), 120, 3)
	assert_eq(first.size(), 120)
	assert_eq(first, second)


func test_different_seed_or_commands_change_the_hash() -> void:
	var reference: PackedInt64Array = _play(_transport(DUEL, 7), 30, 3)
	assert_ne(_play(_transport(DUEL, 8), 30, 3), reference)
	assert_ne(_play(_transport(DUEL, 7), 30, 4)[29], reference[29])


func test_recorded_game_replays_identically() -> void:
	var transport: LocalTransport = _transport(FFA, 11)
	var hashes: PackedInt64Array = _play(transport, 150, 5)
	var replay: Replay = transport.replay
	assert_eq(replay.ticks, 150)
	assert_eq(replay.final_hash, hashes[149])
	assert_gt(replay.commands.size(), 0)
	# Aller-retour par le texte, comme pour un fichier de replay.
	var saved: Dictionary = str_to_var(var_to_str(replay.to_dict()))
	var copy: Replay = Replay.from_dict(saved)
	assert_not_null(copy)
	assert_eq(copy.play(), hashes)


func test_replay_rejects_unknown_format() -> void:
	assert_null(Replay.from_dict({"format": 999}))


func test_commands_survive_a_round_trip() -> void:
	for command: Command in [
		TargetCommand.new(Vector2i(3, -4), 2),
		SetPriorityCommand.new(ColonyState.Priority.ENEMIES_FIRST, 3),
		BuyUpgradeCommand.new(&"damage", 10, 4),
		ChooseMutationCommand.new(2, 5),
		UseAbilityCommand.new(&"cloud", Vector2i(2, 2), 1),
	]:
		command.tick = 42
		var data: Dictionary = JSON.parse_string(JSON.stringify(command.to_dict()))
		var copy: Command = Command.from_dict(data)
		assert_eq(copy.to_dict(), command.to_dict())
		assert_eq(copy.type, command.type)
	assert_null(Command.from_dict({"type": 99}))


func test_long_duel_keeps_numbers_safe_and_ends_by_thirty_minutes() -> void:
	# Deux colonies qui achètent sans arrêt l'amélioration la moins chère pendant 30 minutes.
	var simulation := Simulation.new(SimDefs.from_mode(DUEL), 3, 2)
	var state: GameState = simulation.state
	var finished: bool = false
	while not finished:
		var commands: Array[Command] = []
		for colony: ColonyState in state.colonies:
			var cheapest: StringName = _cheapest(simulation, colony)
			if cheapest != &"":
				commands.append(BuyUpgradeCommand.new(cheapest, 1, colony.id))
			if not colony.pending_offers.is_empty():
				commands.append(ChooseMutationCommand.new(0, colony.id))
		finished = simulation.tick(commands).finished
	assert_lte(state.tick, state.defs.match_ticks)
	assert_eq(state.ranking.size(), 2)
	for colony: ColonyState in state.colonies:
		assert_lt(colony.biomass, SAFE_LIMIT)
		assert_lt(colony.nutrients, SAFE_LIMIT)
	var best: ColonyState = state.colonies[state.ranking[0]]
	assert_gte(best.tier, 3)
	gut.p(
		(
			"Fin à %d s : %d cases, palier %d, production %d/s"
			% [state.tick, best.cell_count, best.tier, best.production / Fixed.ONE]
		)
	)


func _cheapest(simulation: Simulation, colony: ColonyState) -> StringName:
	var best: StringName = &""
	var best_cost: int = 0
	for upgrade: SimUpgrade in simulation.state.defs.upgrades:
		var command := BuyUpgradeCommand.new(upgrade.id, 1, colony.id)
		if simulation.check(command) != Refusal.Code.OK:
			continue
		var cost: int = simulation.upgrade_cost(colony.id, upgrade.id)
		if best == &"" or cost < best_cost:
			best = upgrade.id
			best_cost = cost
	return best
