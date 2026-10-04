extends GutTest
## Déterminisme et rejeu (Architecture §4.4, §11.2) : même graine + mêmes commandes = même
## partie, au bit près ; une partie enregistrée se rejoue à l'identique.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
## Seuil de sécurité des grands nombres (Architecture §4.5), loin de la limite d'un int 64 bits.
const SAFE_LIMIT: int = 1_000_000_000_000_000


## Joue une partie où chaque colonie colonise au hasard (aléatoire de la partie, dérivé par
## colonie), en mélangeant clics directs, ajouts et retraits de file. Renvoie les empreintes.
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
			var command: Command = _random_command(simulation, colony, rngs[colony.id])
			if command != null:
				transport.send_command(command)
		transport.advance()
		hashes.append(results[results.size() - 1].state_hash)
	transport.tick_received.disconnect(on_tick)
	return hashes


func _random_command(simulation: Simulation, colony: ColonyState, rng: SimRng) -> Command:
	var state: GameState = simulation.state
	var roll: int = rng.range_int(10)
	if roll >= 6:
		return null
	var cell: Vector2i = state.map.cells[_random_frontier(state, colony, rng)]
	var command: Command
	if roll == 0 and not colony.queue.is_empty():
		var queued: int = colony.queue[rng.range_int(colony.queue.size())]
		command = DequeueCommand.new(state.map.cells[queued])
	elif roll <= 2:
		command = ColonizeCommand.new(cell)
	else:
		command = EnqueueCommand.new(cell)
	command.colony_id = colony.id
	return command


## Une case au hasard parmi celles qui touchent une case de la colonie (poussée ou en pousse).
func _random_frontier(state: GameState, colony: ColonyState, rng: SimRng) -> int:
	var candidates := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if state.cell_state[cell] != GameState.CellState.FREE:
			continue
		for direction: int in range(6):
			var other: int = state.map.neighbor_index(cell, direction)
			if other >= 0 and state.owner[other] == colony.id:
				candidates.append(cell)
				break
	if candidates.is_empty():
		return colony.heart
	return candidates[rng.range_int(candidates.size())]


func _transport(mode: ModeDef, game_seed: int, colonies: int = -1) -> LocalTransport:
	var defs: SimDefs = SimDefs.from_mode(mode)
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
		ColonizeCommand.new(Vector2i(3, -4), 2),
		EnqueueCommand.new(Vector2i(-1, 5), 1),
		DequeueCommand.new(Vector2i(0, 0), 5)
	]:
		command.tick = 42
		var data: Dictionary = JSON.parse_string(JSON.stringify(command.to_dict()))
		var copy: Command = Command.from_dict(data)
		assert_eq(copy.to_dict(), command.to_dict())
		assert_eq(copy.type, command.type)
		assert_true(copy is CellCommand)
	assert_null(Command.from_dict({"type": 99}))


func test_long_solo_game_keeps_numbers_safe_and_climbs_tiers() -> void:
	# Une colonie seule sur la forêt de FFA, qui colonise sans arrêt pendant 30 minutes.
	var simulation := Simulation.new(SimDefs.from_mode(FFA), 3, 1)
	var colony: ColonyState = simulation.state.colonies[0]
	var rng := SimRng.new(1)
	for tick: int in range(1800):
		var commands: Array[Command] = []
		if colony.queue_load() < simulation.state.defs.expansion_queue_size:
			var cell: int = _random_frontier(simulation.state, colony, rng)
			commands.append(EnqueueCommand.new(simulation.state.map.cells[cell]))
		simulation.tick(commands)
	assert_gte(colony.tier, 3)
	assert_lt(colony.biomass, SAFE_LIMIT)
	assert_lt(colony.nutrients, SAFE_LIMIT)
	gut.p(
		(
			"30 min : %d cases, palier %d, production %d/s"
			% [colony.cell_count, colony.tier, colony.production / Fixed.ONE]
		)
	)
