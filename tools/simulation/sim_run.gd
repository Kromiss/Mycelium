class_name SimRun
extends RefCounted
## Une partie simulée sans affichage (GDD §18.5) : un robot par secteur occupé de la
## composition, jusqu'à la fin de la partie ou de la durée simulée, et ses mesures. Les robots
## étant déterministes, la même graine et la même composition redonnent la même partie (c'est
## ainsi que le panneau la rejoue sur la carte).

const SECONDS_PER_MINUTE: int = 60

var _defs: SimDefs
var _seed: int
var _profiles: Array[StringName]


## « profiles » : profil du robot de chaque secteur (&"" : secteur vide) ; « duration_ticks » :
## durée simulée en secondes (bornée par la durée maximale d'une partie).
func _init(defs: SimDefs, game_seed: int, profiles: Array[StringName], duration_ticks: int) -> void:
	_defs = defs.duplicate_defs()
	_defs.match_ticks = mini(_defs.match_ticks, duration_ticks)
	_seed = game_seed
	_profiles = profiles.duplicate()


## Secteurs occupés d'une composition, dans l'ordre.
static func occupied_sectors(profiles: Array[StringName]) -> PackedInt32Array:
	var sectors := PackedInt32Array()
	for sector: int in range(profiles.size()):
		if profiles[sector] != &"":
			sectors.append(sector)
	return sectors


## Joue la partie et renvoie ses mesures.
func run() -> SimRunResult:
	var result := SimRunResult.new()
	result.game_seed = _seed
	var sectors: PackedInt32Array = occupied_sectors(_profiles)
	var simulation := Simulation.new(_defs.duplicate_defs(), _seed, sectors.size(), sectors)
	var state: GameState = simulation.state
	var robots: Array[Robot] = []
	for colony: ColonyState in state.colonies:
		var profile: StringName = _profiles[colony.sector]
		robots.append(Robot.new(RobotCatalog.find(profile), colony.id, _seed))
		var measures := SimColonyResult.new()
		measures.sector = colony.sector
		measures.profile = profile
		result.colonies.append(measures)
	var minute_start := PackedInt64Array()
	minute_start.resize(state.colonies.size())
	while not state.finished:
		var commands: Array[Command] = []
		for robot: Robot in robots:
			commands.append_array(robot.decide(simulation))
		var tick: TickResult = simulation.tick(commands)
		if not tick.eliminations.is_empty() and result.first_elimination_minute < 0.0:
			result.first_elimination_minute = _minutes(tick.tick + 1)
		if state.tick % SECONDS_PER_MINUTE == 0 or state.finished:
			_end_minute(state, result, minute_start)
	_fill_final(state, result)
	return result


## Fin d'une minute (ou de la partie) : production moyenne de la minute et cases de chaque
## colonie.
func _end_minute(state: GameState, result: SimRunResult, minute_start: PackedInt64Array) -> void:
	for colony: ColonyState in state.colonies:
		var measures: SimColonyResult = result.colonies[colony.id]
		var span: int = state.tick - measures.production_per_minute.size() * SECONDS_PER_MINUTE
		var produced: float = float(colony.biomass - minute_start[colony.id]) / Fixed.ONE
		measures.production_per_minute.append(produced / maxf(1.0, float(span)))
		measures.cells_per_minute.append(float(colony.cell_count))
		minute_start[colony.id] = colony.biomass


func _fill_final(state: GameState, result: SimRunResult) -> void:
	var ranking: PackedInt32Array = VictorySystem.ranking(state)
	result.end_minute = _minutes(state.tick)
	result.ended_at_time = state.alive_count() > 1
	for colony: ColonyState in state.colonies:
		var measures: SimColonyResult = result.colonies[colony.id]
		for tick: int in colony.zone_ticks:
			measures.zone_minutes.append(_minutes(tick))
		for tick: int in colony.tier_ticks:
			measures.tier_minutes.append(_minutes(tick))
		measures.upgrade_levels = colony.upgrade_levels.duplicate()
		measures.rank = ranking.find(colony.id) + 1
		measures.trophies = colony.trophies
		measures.final_cells = colony.cell_count
		measures.final_tier = colony.tier
		measures.final_production = float(colony.production) / Fixed.ONE
		measures.peak_production = float(colony.peak_production) / Fixed.ONE
		measures.biomass = float(colony.biomass) / Fixed.ONE
		measures.cells_captured = colony.cells_captured
		measures.minutes_alive = result.end_minute
		if not colony.alive:
			result.eliminations += 1
			measures.eliminated_minute = _minutes(colony.eliminated_tick + 1)
			measures.minutes_alive = measures.eliminated_minute


static func _minutes(tick: int) -> float:
	return -1.0 if tick < 0 else float(tick) / SECONDS_PER_MINUTE
