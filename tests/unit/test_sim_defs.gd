extends GutTest
## Définitions d'une partie : lecture des données, valeurs dérivées, copies et validation.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")


func test_defaults_come_from_data() -> void:
	var defs: SimDefs = SimDefs.from_mode(FFA)
	assert_eq(defs.mode_id, &"ffa")
	assert_eq(defs.sectors, 6)
	assert_eq(defs.zone_count(), 6)
	assert_eq(defs.radius(), 17)
	assert_eq(defs.unit_cost, 30_000)
	assert_eq(defs.start_stock(), 180_000)
	assert_eq(defs.tier_cells, PackedInt32Array([5, 10, 20, 40, 80, 160]))


func test_prepare_rounds_growth_times_to_the_nearest_second() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.prepare(397)
	assert_eq(defs.growth_ticks_by_zone, PackedInt32Array([4, 5, 6, 8, 10, 12]))
	assert_eq(defs.cost_pow_table.size(), 398)


func test_round_trip_through_a_dictionary_and_text() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.unit_cost = 12_345
	defs.zone_cost_pm[2] = 2_222
	var text: String = var_to_str(defs.to_dict())
	var data: Dictionary = str_to_var(text)
	var copy: SimDefs = SimDefs.from_dict(data)
	assert_eq(copy.to_dict(), defs.to_dict())


func test_round_trip_through_json_keeps_values() -> void:
	var defs: SimDefs = SimDefs.from_mode(FFA)
	var parsed: Dictionary = JSON.parse_string(JSON.stringify(defs.to_dict()))
	assert_eq(SimDefs.from_dict(parsed).to_dict(), defs.to_dict())


func test_copies_are_independent() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var copy: SimDefs = defs.duplicate_defs()
	copy.zone_richness_pm[0] = 9_999
	copy.max_growths = 3
	assert_eq(defs.zone_richness_pm[0], 1_000)
	assert_eq(defs.max_growths, 1)


func test_validate_rejects_absurd_settings() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.sectors = 4
	defs.base_growth_ticks = 0
	defs.expansion_queue_size = 0
	defs.tier_cells[1] = 2
	var problems: PackedStringArray = defs.validate()
	for problem: String in ["sectors", "base_growth_ticks", "queue", "tier_cells"]:
		assert_has(problems, problem)
