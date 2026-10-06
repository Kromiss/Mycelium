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
	assert_eq(defs.start_stock(), 0)
	assert_eq(defs.turret_damage, 5_000)
	assert_eq(defs.tier_cells, PackedInt32Array([5, 10, 20, 40, 80, 160]))
	assert_eq(defs.tier_enzymes, PackedInt32Array([40, 80, 120, 160, 200, 240]))
	assert_eq(defs.upgrades.size(), 12)
	assert_eq(defs.mutations.size(), 14)
	assert_eq(defs.abilities.size(), 3)
	assert_eq(defs.buildings.size(), 3)


func test_prepare_builds_cost_tables() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.prepare()
	var range_index: int = defs.upgrade_index(&"range")
	assert_eq(defs.upgrade_cost_tables[range_index].size(), 3)
	assert_eq(defs.upgrade_cost_tables[range_index][2], 9_000)
	assert_eq(
		defs.upgrade_cost_tables[defs.upgrade_index(&"damage")][1], defs.upgrade_cost_growth_pm
	)


func test_round_trip_through_a_dictionary_and_text() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.unit_cost = 12_345
	defs.zone_free_hp_pm[2] = 2_222
	defs.upgrades[0].effect = 333
	defs.mutations[1].rate_pm = 1_234
	var text: String = var_to_str(defs.to_dict())
	var data: Dictionary = str_to_var(text)
	var copy: SimDefs = SimDefs.from_dict(data)
	assert_eq(copy.to_dict(), defs.to_dict())
	assert_eq(copy.upgrades[0].id, &"damage")


func test_round_trip_through_json_keeps_values() -> void:
	var defs: SimDefs = SimDefs.from_mode(FFA)
	var parsed: Dictionary = JSON.parse_string(JSON.stringify(defs.to_dict()))
	assert_eq(SimDefs.from_dict(parsed).to_dict(), defs.to_dict())


func test_copies_are_independent() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	var copy: SimDefs = defs.duplicate_defs()
	copy.zone_richness_pm[0] = 9_999
	copy.abilities[0].cost_enzymes = 1
	assert_eq(defs.zone_richness_pm[0], 1_000)
	assert_eq(defs.abilities[0].cost_enzymes, 20)


func test_validate_rejects_absurd_settings() -> void:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	defs.sectors = 4
	defs.turret_range = 0
	defs.tier_cells[1] = 2
	defs.upgrades[0].unlock_tier = 9
	var problems: PackedStringArray = defs.validate()
	for problem: String in ["sectors", "turret", "tier_cells", "upgrades"]:
		assert_has(problems, problem)
	assert_eq(SimDefs.from_mode(FFA).validate(), PackedStringArray())
