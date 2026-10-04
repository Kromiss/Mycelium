extends GutTest
## Paliers de colonie, lots d'Enzymes et mutations (GDD §8.3, §10, décidé le 4 octobre 2026).

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(1, false)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func test_tier_follows_the_cell_count_and_doubles_production() -> void:
	_sim.tick()
	var before: int = _colony().production
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	var result: TickResult = _sim.tick()
	assert_eq(_colony().tier, 1)
	assert_eq(result.tier_changes, PackedInt32Array([0, 0, 1]))
	assert_gt(_colony().production, 2 * before)


func test_first_reach_gives_enzymes_and_a_choice_of_three_mutations() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	var result: TickResult = _sim.tick()
	assert_eq(_colony().enzymes, 20_000)
	assert_eq(result.mutation_offers, PackedInt32Array([0]))
	assert_eq(_colony().pending_offers.size(), 3)
	assert_eq(_colony().tier_ticks[0], 0)


func test_losing_and_regaining_a_tier_gives_no_second_lot() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	_sim.tick()
	_colony().cell_count = 3
	_sim.tick()
	assert_eq(_colony().tier, 0)
	_colony().cell_count = 5
	_sim.tick()
	assert_eq(_colony().tier, 1)
	assert_eq(_colony().enzymes, 20_000)
	assert_eq(_colony().pending_offers.size(), 3)


func test_choices_stack_and_are_taken_in_order() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(10))
	_sim.tick()
	assert_eq(_colony().tier, 2)
	assert_eq(_colony().pending_offers.size(), 6)
	var first: int = _colony().pending_offers[1]
	_sim.tick([ChooseMutationCommand.new(1, 0)])
	assert_eq(_colony().mutations, PackedInt32Array([first]))
	assert_eq(_colony().pending_offers.size(), 3)
	_sim.tick([ChooseMutationCommand.new(0, 0)])
	assert_eq(_colony().mutations.size(), 2)
	var empty: TickResult = _sim.tick([ChooseMutationCommand.new(0, 0)])
	assert_eq(empty.refused_codes, PackedInt32Array([Refusal.Code.NO_MUTATION_OFFER]))


func test_a_mutation_is_never_offered_twice() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(10))
	_sim.tick()
	var seen := PackedInt32Array()
	for index: int in _colony().pending_offers:
		assert_false(seen.has(index), "mutation %d proposée deux fois" % index)
		seen.append(index)


func test_gland_adds_half_to_later_lots() -> void:
	_colony().mutations.append(_sim.state.defs.mutation_index(&"gland"))
	Fixture.give(_sim, 0, Fixture.line_to_center(5))
	_sim.tick()
	assert_eq(_colony().enzymes, 30_000)


func test_offers_are_drawn_from_the_seed() -> void:
	var other: Simulation = Fixture.duel(1, false)
	for sim: Simulation in [_sim, other]:
		Fixture.give(sim, 0, Fixture.line_to_center(5))
		sim.tick()
	assert_eq(_colony().pending_offers, other.state.colonies[0].pending_offers)
