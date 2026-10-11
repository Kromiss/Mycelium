extends SceneTree
## Équilibrage (GDD §5 ter, G6) : joue des parties de robots sans affichage et écrit une ligne
## JSON par partie (durée, éliminations, points chauds atteints, meneur à 10:00, rythme…), pour
## mesurer les cibles d'équilibrage. Outil de développement, exclu de l'export.
##
## godot --headless -s res://tools/balance_report.gd -- <duel|ffa> <parties> <robot,robot…> [graine]
##   [réglage=valeur…]
## Exemple : -- duel 20 game_hard,game_hard 1   (un robot par secteur, dans l'ordre ;
## « game_hard:nohot » : robot qui ne pose jamais de point chaud)
## Réglages (essais sans toucher aux fichiers de data/) : « cell_hp=60000 » (constante de
## BalanceDef), « zone_free_hp_pm=1000,1400,… » (tableau des zones ou des paliers),
## « upgrade.push.base_cost_units=2 », « mutation.cohesion.cohesion_pm=1500 ».

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
	var defs: SimDefs = SimDefs.from_mode(mode)
	for i: int in range(4, args.size()):
		if not _override(defs, args[i]):
			printerr("Réglage inconnu : %s" % args[i])
			quit(1)
			return
	var problems: PackedStringArray = defs.validate()
	if not problems.is_empty():
		printerr("Réglages invalides : %s" % ", ".join(problems))
		quit(1)
		return
	for game: int in range(games):
		print(JSON.stringify(_play(defs.duplicate_defs(), mode, first_seed + game, robots)))
	quit(0)


## Applique un réglage « nom=valeur » aux définitions. Faux s'il est inconnu.
func _override(defs: SimDefs, setting: String) -> bool:
	var parts: PackedStringArray = setting.split("=")
	if parts.size() != 2:
		return false
	var path: PackedStringArray = parts[0].split(".")
	if path.size() == 1:
		return _override_field(defs, path[0], parts[1])
	if path.size() != 3:
		return false
	var records: Array = []
	match path[0]:
		"upgrade":
			records = defs.upgrades
		"mutation":
			records = defs.mutations
	for record: SimRecord in records:
		if str(record.get("id")) == path[1] and record.get(path[2]) is int:
			record.set(path[2], parts[1].to_int())
			return true
	return false


## Constante (entier) ou tableau des zones ou des paliers (« 1000,1400,… »).
func _override_field(defs: SimDefs, field: String, value: String) -> bool:
	var current: Variant = defs.get(field)
	if current is PackedInt32Array:
		var values := PackedInt32Array()
		for part: String in value.split(","):
			values.append(part.to_int())
		defs.set(field, values)
	elif current is int:
		defs.set(field, value.to_int())
	else:
		return false
	return true


func _play(defs: SimDefs, mode: ModeDef, game_seed: int, robots: PackedStringArray) -> Dictionary:
	var simulation := Simulation.new(defs, game_seed, robots.size())
	var state: GameState = simulation.state
	var players: Array[Robot] = []
	var count: int = state.colonies.size()
	var reached := PackedInt32Array()
	var first_reach := PackedInt32Array()
	var placed := PackedInt32Array()
	var actions := PackedInt32Array()
	for colony: ColonyState in state.colonies:
		players.append(_robot(robots[colony.id], colony.id, game_seed))
	reached.resize(count)
	placed.resize(count)
	first_reach.resize(count)
	first_reach.fill(-1)
	actions.resize(count)
	var leader_cells: int = -1
	var leader_biomass: int = -1
	var start: int = Time.get_ticks_msec()
	while not state.finished:
		var commands: Array[Command] = []
		for robot: Robot in players:
			commands.append_array(robot.decide(simulation))
		for command: Command in commands:
			actions[command.colony_id] += 1
			if command is HotspotCommand:
				placed[command.colony_id] += 1
		var before: Array[PackedInt32Array] = []
		for colony: ColonyState in state.colonies:
			before.append(colony.hotspots.duplicate())
		var result: TickResult = simulation.tick(commands)
		# Point chaud atteint : sa case est prise par la colonie qui l'avait posé.
		for i: int in range(0, result.captures.size(), 3):
			var colony_id: int = result.captures[i]
			if before[colony_id].has(result.captures[i + 1]):
				reached[colony_id] += 1
				if first_reach[colony_id] < 0:
					first_reach[colony_id] = result.tick
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
					"hotspots_placed": placed[colony.id],
					"hotspots_reached": reached[colony.id],
					"first_reach": first_reach[colony.id],
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


## Robot d'un identifiant du catalogue ; « game_hard:nohot » : le même robot qui ne pose jamais
## de point chaud (mesure de la cible « points chauds décisifs »).
func _robot(spec: String, colony_id: int, game_seed: int) -> Robot:
	var parts: PackedStringArray = spec.split(":")
	var robot: Robot = RobotCatalog.make(StringName(parts[0]), colony_id, game_seed)
	if parts.size() > 1 and parts[1] == "nohot":
		robot.profile = robot.profile.duplicate()
		var none: Array[StringName] = []
		robot.profile.hotspot_goals = none
	return robot


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
