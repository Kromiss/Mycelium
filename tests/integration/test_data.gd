extends GutTest
## Cohérence des données : zones, modes, palettes et traductions.

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
	"res://game/forest_screen.tscn",
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
		assert_gt(current.colonize_cost_pm, previous.colonize_cost_pm)
		assert_gt(current.growth_time_pm, previous.growth_time_pm)
		assert_gt(current.capture_time_pm, previous.capture_time_pm)


func test_modes_have_equitable_colony_counts() -> void:
	# Seuls 2, 3 et 6 colonies donnent des départs strictement équitables (GDD §4.1).
	for mode: ModeDef in MODES:
		assert_has([2, 3, 6], mode.colonies, String(mode.id))
		assert_gt(mode.rings_per_zone, 0)


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
