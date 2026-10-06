extends GutTest
## Production, Cohésion, richesse, Rendement, Armillaire et Biomasse (GDD §8.2, §15).

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")
## Production d'une case de zone 1 à deux voisines : 3,333 × 1,10.
const START_CELL_YIELD: int = 3_666

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func test_start_colony_produces_about_eleven_per_second() -> void:
	_sim.tick()
	assert_eq(_colony().production, 3 * START_CELL_YIELD)
	assert_eq(_colony().nutrients, 3 * START_CELL_YIELD)
	assert_eq(_colony().biomass, 3 * START_CELL_YIELD)


func test_cohesion_is_capped_at_thirty_percent() -> void:
	var center := Vector2i(9, 1)
	var ring: Array[Vector2i] = [center]
	ring.append_array(Hex.neighbors(center))
	Fixture.give(_sim, 0, ring)
	var cell: int = Fixture.cell(_sim, center)
	assert_eq(ColonyStats.cell_production(_sim.state, _colony(), cell), 4_333)


func test_cohesion_mutation_doubles_the_bonus_and_the_cap() -> void:
	_colony().mutations.append(_sim.state.defs.mutation_index(&"cohesion"))
	var turret: int = _colony().turret
	assert_eq(ColonyStats.cell_production(_sim.state, _colony(), turret), 4_000)


func test_zone_richness_multiplies_production() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(3))
	var zone_two: int = Fixture.cell(_sim, Vector2i(9, 0))
	assert_eq(_sim.state.map.zones[zone_two], 2)
	# Une voisine (10, 0) : 3,333 × 1,5 × 1,05.
	assert_eq(ColonyStats.cell_production(_sim.state, _colony(), zone_two), 5_250)


func test_yield_and_the_armillaria_raise_production() -> void:
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"yield")] = 5
	assert_eq(ColonyStats.production_factor(_sim.state, _colony()), 1_500)
	_sim.state.tick = 900
	assert_eq(ColonyStats.strain_pm(_sim.state), 1_125)
	_sim.state.tick = 5_000
	assert_eq(ColonyStats.strain_pm(_sim.state), 1_250)


func test_deep_roots_only_boost_central_zones() -> void:
	_colony().mutations.append(_sim.state.defs.mutation_index(&"deep_roots"))
	var turret: int = _colony().turret
	assert_eq(ColonyStats.cell_production(_sim.state, _colony(), turret), START_CELL_YIELD)


func test_production_follows_the_tier_multiplier() -> void:
	_colony().tier = 3
	assert_eq(ColonyStats.production_factor(_sim.state, _colony()), 8_000)


func test_colonies_get_a_slow_enzyme_income() -> void:
	# La Tourelle ne tire pas : pas de palier ni de lot d'Enzymes pendant le test.
	var defs: SimDefs = Fixture.duel_defs()
	defs.turret_rate_pm = 0
	defs.enzyme_income = 2
	defs.enzyme_income_ticks = 5
	var sim := Simulation.new(defs, 1, 2)
	Fixture.run(sim, 4)
	assert_eq(sim.state.colonies[0].enzymes, 0)
	sim.tick()
	assert_eq(sim.state.colonies[0].enzymes, Fixed.from_units(2))
	assert_eq(sim.state.colonies[1].enzymes, Fixed.from_units(2))
	Fixture.run(sim, 5)
	assert_eq(sim.state.colonies[0].enzymes, Fixed.from_units(4))
