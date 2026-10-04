class_name SimRun
extends RefCounted
## Une partie simulée sans affichage : un robot d'économie seul sur la forêt, pendant une durée
## donnée, et les mesures du panneau de simulations (GDD §14.5).

const SECONDS_PER_MINUTE: int = 60
const THIRDS: int = 3

var _defs: SimDefs
var _seed: int
var _profile: EconomyRobot.Profile
var _duration: int


## « duration_ticks » : durée simulée en secondes (bornée par la durée maximale d'une partie).
func _init(
	defs: SimDefs, game_seed: int, profile: EconomyRobot.Profile, duration_ticks: int
) -> void:
	_defs = defs.duplicate_defs()
	_defs.match_ticks = mini(_defs.match_ticks, duration_ticks)
	_seed = game_seed
	_profile = profile
	_duration = _defs.match_ticks


## Joue la partie et renvoie ses mesures.
func run() -> SimRunResult:
	var result := SimRunResult.new()
	result.profile = _profile
	result.game_seed = _seed
	var replay := Replay.new(_defs, _seed, 1)
	var simulation := Simulation.new(_defs.duplicate_defs(), _seed, 1)
	var robot := EconomyRobot.new(_profile, 0, _seed)
	var state: GameState = simulation.state
	var colony: ColonyState = state.colonies[0]
	# Cases suivies jusqu'à leur remboursement : case → [tick payé, coût, produit cumulé].
	var tracked: Dictionary[int, PackedInt64Array] = {}
	var paybacks: Array[PackedFloat64Array] = [
		PackedFloat64Array(), PackedFloat64Array(), PackedFloat64Array()
	]
	var minute_start: int = 0
	var waits := PackedInt32Array([0, 0, 0])
	while not state.finished:
		var commands: Array[Command] = robot.decide(simulation)
		var tick: TickResult = simulation.tick(commands)
		replay.record_tick(commands, tick)
		for start: int in range(tick.growth_costs.size()):
			var cell: int = tick.growth_started[start * 2 + 1]
			tracked[cell] = PackedInt64Array([tick.tick, tick.growth_costs[start], 0])
		_follow_paybacks(state, colony, tracked, paybacks)
		_count_wait(state, colony, robot, waits)
		if state.tick % SECONDS_PER_MINUTE == 0 or state.finished:
			var span: int = state.tick - (result.production_per_minute.size() * SECONDS_PER_MINUTE)
			var produced: float = float(colony.biomass - minute_start) / Fixed.ONE
			result.production_per_minute.append(produced / maxf(1.0, float(span)))
			minute_start = colony.biomass
	for cell: int in tracked:
		result.unpaid_cells[_third(tracked[cell][0])] += 1
	for third: int in range(THIRDS):
		result.payback_seconds[third] = _mean(paybacks[third])
	_fill_final(result, state, colony, waits)
	result.replay = replay
	return result


## Ajoute à chaque case suivie ce qu'elle a produit ce tick ; une case remboursée sort du suivi.
func _follow_paybacks(
	state: GameState,
	colony: ColonyState,
	tracked: Dictionary[int, PackedInt64Array],
	paybacks: Array[PackedFloat64Array]
) -> void:
	var tier_pm: int = TierSystem.production_pm(state.defs, colony.tier)
	var repaid := PackedInt32Array()
	for cell: int in tracked:
		if state.connected[cell] == 0 or state.owner[cell] != colony.id:
			continue
		var entry: PackedInt64Array = tracked[cell]
		entry[2] += Fixed.mul(EconomySystem.cell_production(state, colony.id, cell), tier_pm)
		tracked[cell] = entry
		if entry[2] >= entry[1]:
			paybacks[_third(entry[0])].append(float(state.tick - entry[0]))
			repaid.append(cell)
	for cell: int in repaid:
		tracked.erase(cell)


## Ce qui freine la colonie à ce tick (GDD §14.5) : la pousse, les nutriments, ou rien à prendre.
func _count_wait(
	state: GameState, colony: ColonyState, robot: EconomyRobot, waits: PackedInt32Array
) -> void:
	if colony.growing.size() >= Buildings.max_growths(state, colony):
		waits[0] += 1
	elif not colony.queue.is_empty() or robot.last_candidate_count > 0:
		waits[1] += 1
	else:
		waits[2] += 1


func _fill_final(
	result: SimRunResult, state: GameState, colony: ColonyState, waits: PackedInt32Array
) -> void:
	for tick: int in colony.zone_ticks:
		result.zone_minutes.append(_minutes(tick))
	for tick: int in colony.tier_ticks:
		result.tier_minutes.append(_minutes(tick))
	var total: float = maxf(1.0, float(state.tick))
	result.waiting_growth = waits[0] / total
	result.waiting_nutrients = waits[1] / total
	result.waiting_nothing = waits[2] / total
	result.final_cells = colony.cell_count
	result.final_tier = colony.tier
	result.final_production = float(colony.production) / Fixed.ONE
	result.peak_production = float(colony.peak_production) / Fixed.ONE
	result.biomass = float(colony.biomass) / Fixed.ONE


## Tiers de la partie (0, 1 ou 2) dans lequel tombe un tick.
func _third(tick: int) -> int:
	return clampi(tick * THIRDS / maxi(1, _duration), 0, THIRDS - 1)


static func _minutes(tick: int) -> float:
	return -1.0 if tick < 0 else float(tick) / SECONDS_PER_MINUTE


static func _mean(values: PackedFloat64Array) -> float:
	if values.is_empty():
		return -1.0
	var total: float = 0.0
	for value: float in values:
		total += value
	return total / values.size()
