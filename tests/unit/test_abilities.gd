extends GutTest
## Capacités actives (GDD §11) : Salve, Mur de mycélium, Nuage toxique.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)
	_sim.state.tick = _sim.state.defs.protection_ticks
	_colony().tier = 6
	_colony().cell_count = 160
	_colony().enzymes = 1_000_000
	# Paliers déjà atteints : pas de lots d'Enzymes pendant les tests.
	_colony().tier_ticks.fill(0)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _use(id: StringName, coords: Vector2i = Vector2i.ZERO) -> TickResult:
	return _sim.tick([UseAbilityCommand.new(id, coords, 0)])


func test_salvo_multiplies_the_fire_rate_for_ten_seconds() -> void:
	var result: TickResult = _use(&"salvo")
	assert_eq(result.refused.size(), 0)
	assert_eq(_colony().enzymes, 980_000)
	var shots: int = 0
	for i: int in range(0, result.shots.size(), 2):
		if result.shots[i] == 0:
			shots += 1
	assert_eq(shots, 5)
	Fixture.run(_sim, 9)
	assert_eq(ColonyStats.rate_pm(_sim.state, _colony()), 1_000)


func test_cooldown_cost_tier_and_protection_are_checked() -> void:
	_use(&"salvo")
	var again: TickResult = _use(&"salvo")
	assert_eq(again.refused_codes, PackedInt32Array([Refusal.Code.COOLDOWN]))
	_colony().enzymes = 0
	var poor: TickResult = _use(&"wall", Fixture.TURRET_0)
	assert_eq(poor.refused_codes, PackedInt32Array([Refusal.Code.NOT_ENOUGH_ENZYMES]))
	var protected: Simulation = Fixture.duel(2)
	protected.state.colonies[0].tier = 1
	protected.state.colonies[0].cell_count = 5
	protected.state.colonies[0].enzymes = 1_000_000
	var early: TickResult = protected.tick([UseAbilityCommand.new(&"salvo", Vector2i.ZERO, 0)])
	assert_eq(early.refused_codes, PackedInt32Array([Refusal.Code.PROTECTED]))
	var locked: Simulation = Fixture.duel(2)
	locked.state.tick = locked.state.defs.protection_ticks
	locked.state.colonies[0].enzymes = 1_000_000
	var low: TickResult = locked.tick([UseAbilityCommand.new(&"salvo", Vector2i.ZERO, 0)])
	assert_eq(low.refused_codes, PackedInt32Array([Refusal.Code.TIER_LOCKED]))


func test_wall_protects_my_cells_around_the_chosen_cell() -> void:
	_use(&"wall", Fixture.TURRET_0)
	var inner: int = Fixture.cell(_sim, Fixture.INNER_0)
	assert_true(Combat.is_walled(_sim.state, _colony(), inner))
	Fixture.run(_sim, 15)
	assert_false(Combat.is_walled(_sim.state, _colony(), inner))


func test_cloud_hits_the_cell_and_its_neighbours_and_stops_their_regeneration() -> void:
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"range")] = 3
	var result: TickResult = _use(&"cloud", Vector2i(6, 1))
	assert_eq(result.refused.size(), 0)
	# 20 tirs de 10 dégâts = 200 : ces cases (80 PV) ne touchent pas le territoire, elles
	# restent à 1 PV et ne se régénèrent plus pendant 30 s.
	for coords: Vector2i in [Vector2i(6, 1), Vector2i(7, 0)]:
		var cell: int = Fixture.cell(_sim, coords)
		assert_eq(_sim.state.hp[cell], 1)
		assert_eq(_sim.state.no_regen_until[cell], _sim.state.tick - 1 + 30)
	var far: TickResult = _use(&"cloud", Vector2i(0, 0))
	assert_eq(far.refused_codes, PackedInt32Array([Refusal.Code.COOLDOWN]))
	_colony().ability_ready[_sim.state.defs.ability_index(&"cloud")] = 0
	far = _use(&"cloud", Vector2i(0, 0))
	assert_eq(far.refused_codes, PackedInt32Array([Refusal.Code.OUT_OF_RANGE]))
