extends GutTest
## Améliorations du panneau (GDD §9) : coût × 1,15 par niveau, achats par 1, 10 ou au
## maximum, palier requis, niveau maximal, effets.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _level(id: StringName) -> int:
	return _colony().upgrade_levels[_sim.state.defs.upgrade_index(id)]


func test_cost_grows_by_fifteen_percent_per_level() -> void:
	assert_eq(_sim.upgrade_cost(0, &"push"), 30_000)
	assert_eq(_sim.upgrade_cost(0, &"vigor"), 60_000)
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"push")] = 2
	assert_eq(_sim.upgrade_cost(0, &"push"), 39_690)


func test_buying_spends_nutrients_and_raises_the_level() -> void:
	_colony().nutrients = 100_000
	var result: TickResult = _sim.tick([BuyUpgradeCommand.new(&"push", 1, 0)])
	assert_eq(result.refused.size(), 0)
	assert_eq(_level(&"push"), 1)
	assert_eq(ColonyStats.push_per_cell(_sim.state.defs, _colony()), 1_250)


func test_buy_ten_and_max_buy_what_is_affordable() -> void:
	_colony().nutrients = 10_000_000
	var ten: PackedInt64Array = _sim.upgrade_preview(0, &"push", 10)
	assert_eq(ten[0], 10)
	_sim.tick([BuyUpgradeCommand.new(&"push", 10, 0)])
	assert_eq(_level(&"push"), 10)
	var maximum: PackedInt64Array = _sim.upgrade_preview(0, &"push", 0)
	_sim.tick([BuyUpgradeCommand.new(&"push", 0, 0)])
	assert_eq(_level(&"push"), 10 + maximum[0])
	assert_lt(_colony().nutrients, _sim.upgrade_cost(0, &"push"))


func test_refusals_tier_money_and_maximum_level() -> void:
	var tier: TickResult = _sim.tick([BuyUpgradeCommand.new(&"regen", 1, 0)])
	assert_eq(tier.refused_codes, PackedInt32Array([Refusal.Code.TIER_LOCKED]))
	_colony().nutrients = 0
	var money: TickResult = _sim.tick([BuyUpgradeCommand.new(&"push", 1, 0)])
	assert_eq(money.refused_codes, PackedInt32Array([Refusal.Code.NOT_ENOUGH_NUTRIENTS]))
	_colony().tier = 1
	_colony().upgrade_levels[_sim.state.defs.upgrade_index(&"regen")] = 3
	_colony().nutrients = 1_000_000_000_000
	var top: TickResult = _sim.tick([BuyUpgradeCommand.new(&"regen", 1, 0)])
	assert_eq(top.refused_codes, PackedInt32Array([Refusal.Code.MAX_LEVEL]))
	var unknown: TickResult = _sim.tick([BuyUpgradeCommand.new(&"nope", 1, 0)])
	assert_eq(unknown.refused_codes, PackedInt32Array([Refusal.Code.UNKNOWN_UPGRADE]))


func test_miser_mutation_lowers_costs() -> void:
	_colony().mutations.append(_sim.state.defs.mutation_index(&"miser"))
	assert_eq(_sim.upgrade_cost(0, &"push"), 25_500)


func test_upgrades_change_the_propagation_and_sporophore_numbers() -> void:
	var defs: SimDefs = _sim.state.defs
	for id: StringName in [&"push", &"vigor", &"turret_hp"]:
		_colony().upgrade_levels[defs.upgrade_index(id)] = 2
	assert_eq(ColonyStats.push_per_cell(defs, _colony()), 1_500)
	assert_eq(ColonyStats.push_cap(defs, _colony()), 11_200)
	assert_eq(ColonyStats.turret_max_hp(defs, _colony()), 600_000)
	_colony().tier = 2
	assert_eq(ColonyStats.push_cap(defs, _colony()), Fixed.mul(18_000, 1_400))
