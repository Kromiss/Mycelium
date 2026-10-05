extends SceneTree
## Équilibrage (GDD §5 ter) : joue des parties de robots sans affichage et écrit une ligne JSON
## par partie (durée, éliminations, bâtiments posés par type, meneur à 10:00, rythme…), pour
## mesurer les cibles d'équilibrage. Outil de développement, exclu de l'export.
##
## godot --headless -s res://tools/balance_report.gd -- <duel|ffa> <parties> <robot,robot…> [graine]
## Exemple : -- duel 20 game_hard,game_hard 1   (un robot par secteur, dans l'ordre)

const MODES: Dictionary[String, String] = {
	"duel": "res://data/modes/duel.tres",
	"ffa": "res://data/modes/ffa.tres",
}
## Instant où l'on note le meneur (10:00).
const LEADER_TICK: int = 600


func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.size() < 3:
		printerr("Usage : -- <duel|ffa> <parties> <robot,robot…> [graine]")
		quit(1)
		return
	var mode: ModeDef = load(MODES[args[0]])
	var games: int = args[1].to_int()
	var robots: PackedStringArray = args[2].split(",")
	var first_seed: int = args[3].to_int() if args.size() > 3 else 1
	for game: int in range(games):
		print(JSON.stringify(_play(mode, first_seed + game, robots)))
	quit(0)


func _play(mode: ModeDef, game_seed: int, robots: PackedStringArray) -> Dictionary:
	var defs: SimDefs = SimDefs.from_mode(mode)
	var simulation := Simulation.new(defs, game_seed, robots.size())
	var state: GameState = simulation.state
	var players: Array[Robot] = []
	var count: int = state.colonies.size()
	var built: Array[PackedInt32Array] = []
	var first_build := PackedInt32Array()
	var actions := PackedInt32Array()
	for colony: ColonyState in state.colonies:
		players.append(RobotCatalog.make(StringName(robots[colony.id]), colony.id, game_seed))
		var types := PackedInt32Array()
		types.resize(defs.buildings.size())
		built.append(types)
	first_build.resize(count)
	first_build.fill(-1)
	actions.resize(count)
	var leader_cells: int = -1
	var leader_biomass: int = -1
	var start: int = Time.get_ticks_msec()
	while not state.finished:
		var commands: Array[Command] = []
		for robot: Robot in players:
			commands.append_array(robot.decide(simulation))
		for command: Command in commands:
			if command is BuildCommand or command is BuyUpgradeCommand:
				actions[command.colony_id] += 1
			elif command is UseAbilityCommand or command is DemolishCommand:
				actions[command.colony_id] += 1
		var result: TickResult = simulation.tick(commands)
		for i: int in range(0, result.building_events.size(), 3):
			if result.building_events[i] != TickResult.BuildingEvent.BUILT:
				continue
			var colony_id: int = result.building_events[i + 2]
			var building: BuildingState = state.building_on(result.building_events[i + 1])
			built[colony_id][building.type] += 1
			if first_build[colony_id] < 0:
				first_build[colony_id] = result.tick
		if state.tick == LEADER_TICK:
			leader_cells = _leader(state, true)
			leader_biomass = _leader(state, false)
	var colonies: Array[Dictionary] = []
	for colony: ColonyState in state.colonies:
		(
			colonies
			. append(
				{
					"robot": robots[colony.id],
					"alive": colony.alive,
					"eliminated": colony.eliminated_tick,
					"killer": colony.killer,
					"trophies": colony.trophies,
					"cells": colony.cell_count,
					"tier": colony.tier,
					"production": colony.production / 1000.0,
					"peak": colony.peak_production / 1000.0,
					"biomass": colony.biomass / 1000.0,
					"zones": Array(colony.zone_ticks),
					"tiers": Array(colony.tier_ticks),
					"built": Array(built[colony.id]),
					"first_build": first_build[colony.id],
					"actions": actions[colony.id],
					"upgrades": Array(colony.upgrade_levels),
				}
			)
		)
	return {
		"seed": game_seed,
		"mode": String(mode.id),
		"end": state.tick,
		"ranking": Array(state.ranking),
		"leader_cells": leader_cells,
		"leader_biomass": leader_biomass,
		"ms": Time.get_ticks_msec() - start,
		"colonies": colonies,
	}


## Colonie en tête : la plus grande (cases) ou la plus productive (Biomasse) ; en vie d'abord.
func _leader(state: GameState, by_cells: bool) -> int:
	var best: int = -1
	var best_value: int = -1
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var value: int = colony.cell_count if by_cells else colony.biomass
		if value > best_value:
			best = colony.id
			best_value = value
	return best
