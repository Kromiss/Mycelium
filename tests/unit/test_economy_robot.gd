extends GutTest
## Robots d'économie (GDD §14.5) : production ajoutée, choix de chaque profil, file pleine.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const ABOVE := Vector2i(10, -1)

var _sim: Simulation


func before_each() -> void:
	_sim = Simulation.new(SimDefs.from_mode(DUEL), 5, 1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _robot(profile: EconomyRobot.Profile) -> EconomyRobot:
	return EconomyRobot.new(profile, 0, 5)


func test_added_production_counts_the_cell_and_its_neighbours_bonus() -> void:
	var cell: int = _sim.cell_index(ABOVE)
	# La case (3,333 × 1,10) + 5 % de ses deux voisines poussées (3,333 × 0,05 chacune).
	assert_eq(EconomySystem.added_production(_sim.state, 0, cell), 3_666 + 2 * 167)


func test_every_profile_picks_a_cell_that_can_enter_the_queue() -> void:
	for profile: int in EconomyRobot.Profile.values():
		var robot: EconomyRobot = _robot(profile as EconomyRobot.Profile)
		var cell: int = robot.choose(_sim.state, _colony())
		assert_gte(cell, 0, "profil %d" % profile)
		assert_eq(Expansion.check_enqueue(_sim.state, _colony(), cell), Refusal.Code.OK)


func test_profitable_takes_the_best_ratio() -> void:
	var robot: EconomyRobot = _robot(EconomyRobot.Profile.PROFITABLE)
	var chosen: int = robot.choose(_sim.state, _colony())
	var best: float = 0.0
	for cell: int in range(_sim.state.cell_count()):
		if Expansion.check_enqueue(_sim.state, _colony(), cell) != Refusal.Code.OK:
			continue
		var ratio: float = (
			float(EconomySystem.added_production(_sim.state, 0, cell))
			/ float(Expansion.cost(_sim.state, _colony(), cell))
		)
		best = maxf(best, ratio)
	var chosen_ratio: float = (
		float(EconomySystem.added_production(_sim.state, 0, chosen))
		/ float(Expansion.cost(_sim.state, _colony(), chosen))
	)
	assert_almost_eq(chosen_ratio, best, 0.000001)


func test_center_takes_the_richest_cell_it_can_pay() -> void:
	var robot: EconomyRobot = _robot(EconomyRobot.Profile.CENTER)
	var chosen: int = robot.choose(_sim.state, _colony())
	# Le réseau de départ touche la zone 2 (9, 0), et le stock (180) paie 42.
	assert_eq(_sim.state.map.zones[chosen], 2)
	_colony().nutrients = 0
	assert_eq(robot.choose(_sim.state, _colony()), -1)
	# Avec un budget, il ne regarde que ce que ce budget paie.
	_colony().nutrients = 180_000
	assert_eq(robot.choose(_sim.state, _colony(), 0), -1)


func test_fast_minimises_growth_plus_payback() -> void:
	var robot: EconomyRobot = _robot(EconomyRobot.Profile.FAST)
	var chosen: int = robot.choose(_sim.state, _colony())
	var state: GameState = _sim.state
	var payback: Callable = func(cell: int) -> float:
		var added: float = float(EconomySystem.added_production(state, 0, cell))
		return (
			float(Expansion.cost(state, _colony(), cell)) / added
			+ Expansion.growth_ticks(state, cell)
		)
	for cell: int in range(state.cell_count()):
		if Expansion.check_enqueue(state, _colony(), cell) == Refusal.Code.OK:
			var chosen_value: float = payback.call(chosen)
			var value: float = payback.call(cell)
			assert_lte(chosen_value, value + 0.000001)


func test_random_is_reproducible_and_stays_among_the_best() -> void:
	var first: Array[int] = []
	var second: Array[int] = []
	for i: int in range(5):
		first.append(_robot(EconomyRobot.Profile.RANDOM).choose(_sim.state, _colony()))
	var robot: EconomyRobot = _robot(EconomyRobot.Profile.RANDOM)
	var again: EconomyRobot = _robot(EconomyRobot.Profile.RANDOM)
	for i: int in range(5):
		second.append(robot.choose(_sim.state, _colony()))
		assert_eq(again.choose(_sim.state, _colony()), second[i])
	assert_eq(first[0], second[0])
