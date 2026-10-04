extends GutTest
## Panneau de simulations : une partie mesurée, des lots, un balayage, le tableau et le CSV.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")

var _locale: String


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")


func after_each() -> void:
	TranslationServer.set_locale(_locale)


func _run(profile: EconomyRobot.Profile, ticks: int) -> SimRunResult:
	return SimRun.new(SimDefs.from_mode(DUEL), 3, profile, ticks).run()


func test_a_run_measures_zones_tiers_production_and_brakes() -> void:
	var result: SimRunResult = _run(EconomyRobot.Profile.PROFITABLE, 600)
	assert_eq(result.zone_minutes[0], 0.0)
	assert_eq(result.production_per_minute.size(), 10)
	assert_gt(result.tier_minutes[0], 0.0)
	# Les paliers et les zones arrivent dans l'ordre.
	for i: int in range(1, result.tier_minutes.size()):
		if result.tier_minutes[i] >= 0.0:
			assert_gte(result.tier_minutes[i], result.tier_minutes[i - 1])
	var shares: float = result.waiting_growth + result.waiting_nutrients + result.waiting_nothing
	assert_almost_eq(shares, 1.0, 0.0001)
	assert_gt(result.final_cells, 3)
	assert_gt(result.payback_seconds[0], 0.0)
	# La production croît d'une minute à l'autre au début.
	assert_gt(result.production_per_minute[9], result.production_per_minute[0])


func test_a_run_is_reproducible_and_its_replay_matches() -> void:
	var first: SimRunResult = _run(EconomyRobot.Profile.RANDOM, 300)
	var second: SimRunResult = _run(EconomyRobot.Profile.RANDOM, 300)
	assert_eq(first.final_cells, second.final_cells)
	assert_eq(first.biomass, second.biomass)
	assert_eq(first.replay.final_hash, second.replay.final_hash)
	var hashes: PackedInt64Array = first.replay.play()
	assert_eq(hashes[hashes.size() - 1], first.replay.final_hash)


func test_center_reaches_the_inner_zones_sooner_than_profitable() -> void:
	var center: SimRunResult = _run(EconomyRobot.Profile.CENTER, 900)
	var profitable: SimRunResult = _run(EconomyRobot.Profile.PROFITABLE, 900)
	assert_gte(center.zone_minutes[1], 0.0)
	if profitable.zone_minutes[1] >= 0.0:
		assert_lte(center.zone_minutes[1], profitable.zone_minutes[1])


func test_stats() -> void:
	var stats: SimStats = SimStats.of(PackedFloat64Array([2.0, 4.0, -1.0, 6.0]))
	assert_eq(stats.count, 3)
	assert_eq(stats.total, 4)
	assert_almost_eq(stats.mean, 4.0, 0.0001)
	assert_eq(stats.minimum, 2.0)
	assert_eq(stats.maximum, 6.0)
	assert_almost_eq(stats.deviation, sqrt(8.0 / 3.0), 0.0001)
	assert_eq(SimStats.of(PackedFloat64Array([-1.0])).mean, -1.0)


func test_simple_batch_has_one_series_per_profile() -> void:
	var runner := SimRunner.new()
	var profiles: Array[int] = [EconomyRobot.Profile.FAST, EconomyRobot.Profile.CENTER]
	runner.setup(SimDefs.from_mode(DUEL), profiles, 2, 10, 120)
	assert_eq(runner.job_count(), 4)
	runner.run_all()
	assert_eq(runner.progress(), 1.0)
	assert_eq(runner.series.size(), 2)
	assert_eq(runner.series[0].label(), "Fast")
	assert_eq(runner.series[1].results[1].game_seed, 11)
	var rows: Array[SimReport.Row] = SimReport.rows(runner.series, false)
	assert_gt(rows.size(), 10)
	assert_eq(rows[0].label, "Arrival in zone 2 (min)")
	assert_eq(SimReport.mean_curve(runner.series[0]).size(), 2)


func test_sweep_makes_one_series_per_value_and_profile() -> void:
	var runner := SimRunner.new()
	var params: Array[SandboxParam] = SandboxParam.all(6, 6)
	var unit_cost: SandboxParam = params[0]
	assert_eq(unit_cost.id, "unit_cost")
	var profiles: Array[int] = [EconomyRobot.Profile.PROFITABLE]
	runner.setup(SimDefs.from_mode(DUEL), profiles, 1, 1, 60, unit_cost, 20.0, 40.0, 10.0)
	assert_eq(runner.series.size(), 3)
	assert_eq(runner.series[2].defs.unit_cost, 40_000)
	assert_eq(runner.series[1].label(), "Profitable · 30")
	runner.run_all()
	var csv: String = SimReport.to_csv(runner.series)
	var lines: PackedStringArray = csv.strip_edges().split("\n")
	assert_eq(lines[0], "Measure,Statistic,Profitable · 20,Profitable · 30,Profitable · 40")
	assert_string_contains(csv, "Production in minute 1 (/s),mean,")


func test_sweep_values() -> void:
	assert_eq(SimRunner.sweep_values(1.0, 2.0, 0.5), PackedFloat64Array([1.0, 1.5, 2.0]))
	assert_eq(SimRunner.sweep_values(3.0, 1.0, 1.0), PackedFloat64Array([3.0]))


func test_threaded_batch_finishes() -> void:
	var runner := SimRunner.new()
	var profiles: Array[int] = [EconomyRobot.Profile.PROFITABLE, EconomyRobot.Profile.RANDOM]
	runner.setup(SimDefs.from_mode(DUEL), profiles, 2, 1, 60)
	runner.start()
	while not runner.is_finished():
		OS.delay_msec(10)
	assert_eq(runner.progress(), 1.0)
	for one: SimRunner.Series in runner.series:
		for result: SimRunResult in one.results:
			assert_not_null(result)
