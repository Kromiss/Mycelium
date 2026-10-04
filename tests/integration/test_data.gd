extends GutTest
## Cohérence des données : zones, paliers, améliorations, mutations, capacités, modes et
## traductions.

# Chargées avec load() : un preload() en constante fausse ici la vérification des types.
const ZONES_PATH: String = "res://data/zones.tres"
const MODES: Array[ModeDef] = [
	preload("res://data/modes/duel.tres"),
	preload("res://data/modes/ffa.tres"),
]
const TRANSLATIONS_PATH: String = "res://i18n/translations.csv"
## Fichiers dans lesquels on cherche les clés de traduction utilisées.
const SOURCES: Array[String] = [
	"res://ui/menus/main_menu.tscn",
	"res://ui/menus/main_menu.gd",
	"res://ui/settings/settings_screen.tscn",
	"res://ui/settings/settings_screen.gd",
	"res://ui/sandbox/sandbox_setup.tscn",
	"res://ui/sandbox/sandbox_setup.gd",
	"res://ui/hud/hud.tscn",
	"res://ui/hud/hud.gd",
	"res://ui/hud/cell_tooltip.gd",
	"res://ui/sandbox/sandbox_param.gd",
	"res://ui/sandbox/settings_form.gd",
	"res://ui/sandbox/settings_form.tscn",
	"res://game/sandbox_recap.gd",
	"res://game/sandbox_screen.gd",
	"res://view/input/map_input.gd",
	"res://autoload/settings_store.gd",
	"res://data/colors.tres",
	"res://data/modes/duel.tres",
	"res://data/modes/ffa.tres",
]


func test_six_zones_numbered_from_the_edge() -> void:
	var zones: ZoneTable = load(ZONES_PATH)
	assert_eq(zones.count(), 6)
	for i: int in range(zones.count()):
		assert_eq(zones.zones[i].zone, i + 1)


func test_zones_get_richer_and_harder_towards_the_center() -> void:
	var zones: ZoneTable = load(ZONES_PATH)
	for i: int in range(1, zones.count()):
		var previous: ZoneDef = zones.zones[i - 1]
		var current: ZoneDef = zones.zones[i]
		assert_gt(current.richness_pm, previous.richness_pm)
		assert_gt(current.free_hp_pm, previous.free_hp_pm)
		assert_gt(current.defense_pm, previous.defense_pm)


func test_modes_have_equitable_colony_counts() -> void:
	# Seuls 2, 3 et 6 colonies donnent des départs strictement équitables (GDD §4.1).
	for mode: ModeDef in MODES:
		assert_has([2, 3, 6], mode.colonies, String(mode.id))
		assert_gt(mode.rings_per_zone, 0)


func test_tiers_double_production_at_growing_thresholds() -> void:
	var tiers: TierTable = load("res://data/tiers.tres")
	assert_eq(tiers.count(), 6)
	var cells: int = MapGenerator.START_CELLS
	var production: int = Fixed.ONE
	for i: int in range(tiers.count()):
		var tier: TierDef = tiers.tiers[i]
		assert_eq(tier.tier, i + 1)
		assert_gt(tier.cells, cells)
		assert_gt(tier.production_pm, production)
		assert_gt(tier.enzymes, 0)
		cells = tier.cells
		production = tier.production_pm


func test_balance_values_are_usable() -> void:
	for mode: ModeDef in MODES:
		var defs: SimDefs = SimDefs.from_mode(mode)
		assert_eq(defs.validate(), PackedStringArray(), String(mode.id))
		assert_eq(defs.radius(), MapGenerator.generate(mode, 6).radius)
	var balance: BalanceDef = load("res://data/balance.tres")
	assert_gt(balance.unit_cost, 0)
	assert_gt(balance.cell_yield, 0)
	assert_gt(balance.turret_damage, 0)
	assert_gt(balance.cell_hp, 0)
	assert_lt(balance.protection_ticks, balance.match_ticks)


func test_upgrades_match_the_catalogue() -> void:
	var table: UpgradeTable = load("res://data/upgrades.tres")
	var ids: Array[StringName] = []
	for upgrade: UpgradeDef in table.upgrades:
		assert_false(ids.has(upgrade.id), String(upgrade.id))
		ids.append(upgrade.id)
		assert_gt(upgrade.effect, 0, String(upgrade.id))
		assert_gt(upgrade.base_cost_units, 0, String(upgrade.id))
		assert_between(upgrade.unlock_tier, 0, 6, String(upgrade.id))
	assert_eq(
		ids,
		[
			&"damage",
			&"rate",
			&"range",
			&"yield",
			&"regen",
			&"heal",
			&"spores",
			&"cell_hp",
			&"splash",
			&"crit",
			&"turret_hp",
			&"bounce",
		]
	)


func test_every_mutation_changes_something() -> void:
	var table: MutationTable = load("res://data/mutations.tres")
	assert_eq(table.mutations.size(), 15)
	var neutral := MutationDef.new()
	for mutation: MutationDef in table.mutations:
		var changes: int = 0
		for property: Dictionary in mutation.get_property_list():
			var name: String = property["name"]
			if property["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE == 0:
				continue
			if name in ["id", "name_key", "desc_key"]:
				continue
			if mutation.get(name) != neutral.get(name):
				changes += 1
		assert_gt(changes, 0, String(mutation.id))


func test_abilities_unlock_at_tiers_one_three_and_five() -> void:
	var table: AbilityTable = load("res://data/abilities.tres")
	var tiers: Array[int] = []
	for ability: AbilityDef in table.abilities:
		tiers.append(ability.unlock_tier)
	assert_eq(tiers, [1, 3, 5])


func test_content_names_are_translated() -> void:
	var rows: Dictionary[String, PackedStringArray] = _translation_rows()
	var defs: SimDefs = SimDefs.from_mode(MODES[0])
	var keys: Array[String] = []
	for upgrade: SimUpgrade in defs.upgrades:
		keys.append(upgrade.name_key)
	for mutation: SimMutation in defs.mutations:
		keys.append_array([mutation.name_key, mutation.desc_key])
	for ability: SimAbility in defs.abilities:
		keys.append(ability.name_key)
	for name: String in Refusal.Code.keys():
		if name != "OK":
			keys.append("REFUSAL_" + name)
	for key: String in keys:
		assert_true(rows.has(key), key)


func test_every_translation_has_english_and_french() -> void:
	var rows: Dictionary[String, PackedStringArray] = _translation_rows()
	assert_gt(rows.size(), 0)
	for key: String in rows:
		var row: PackedStringArray = rows[key]
		assert_eq(row.size(), 3, key)
		assert_ne(row[1].strip_edges(), "", key + " (en)")
		assert_ne(row[2].strip_edges(), "", key + " (fr)")


func test_every_key_used_in_screens_is_translated() -> void:
	var rows: Dictionary[String, PackedStringArray] = _translation_rows()
	var pattern := RegEx.new()
	assert_eq(pattern.compile('"([A-Z][A-Z0-9_]+)"'), OK)
	for path: String in SOURCES:
		var content: String = FileAccess.get_file_as_string(path)
		for found: RegExMatch in pattern.search_all(content):
			var key: String = found.get_string(1)
			assert_true(rows.has(key), "%s : clé %s absente" % [path, key])


func _translation_rows() -> Dictionary[String, PackedStringArray]:
	var rows: Dictionary[String, PackedStringArray] = {}
	var file := FileAccess.open(TRANSLATIONS_PATH, FileAccess.READ)
	var header: PackedStringArray = file.get_csv_line()
	assert_eq(header, PackedStringArray(["keys", "en", "fr"]))
	while not file.eof_reached():
		var row: PackedStringArray = file.get_csv_line()
		if row.size() == 1 and row[0] == "":
			continue
		rows[row[0]] = row
	return rows
