class_name SettingsForm
extends VBoxContainer
## Formulaire des réglages du Bac à sable (GDD §2.1 bis) : forêt, graine, économie, zones,
## paliers et, depuis G2, réglages généraux des bâtiments et réglages de chaque bâtiment.
## Partagé par l'écran de réglages et par le panneau de simulations.

const FOREST_MODES: Array[StringName] = [&"duel", &"ffa"]
const FIELD_WIDTH: float = 140.0
## Largeur des champs de la grille des bâtiments (une colonne par bâtiment).
const BUILDING_FIELD_WIDTH: float = 118.0
## Taille du texte des champs (plus petite que celle des menus, pour tout faire tenir).
const FIELD_FONT_SIZE: int = 20
## Libellé à montrer pour chaque problème signalé par SimDefs.validate().
const PROBLEM_KEYS: Dictionary[String, String] = {
	"sectors": "SANDBOX_FOREST",
	"rings_per_zone": "SANDBOX_FOREST",
	"zones": "SANDBOX_ZONES",
	"tiers": "SANDBOX_TIERS",
	"tier_cells": "SANDBOX_TIER_CELLS",
	"economy": "SANDBOX_ECONOMY",
	"base_growth_ticks": "SANDBOX_GROWTH",
	"colonize_cost_growth_pm": "SANDBOX_COST_GROWTH",
	"queue": "SANDBOX_QUEUE",
	"match_ticks": "SIM_DURATION",
	"sites": "SANDBOX_CONSTRUCTION",
	"buildings": "SANDBOX_BUILDINGS",
	"build_ticks": "SANDBOX_CONSTRUCTION",
	"building_slots": "SANDBOX_BUILDING_SLOTS",
	"demolish_refund_pm": "SANDBOX_DEMOLISH_REFUND",
}

var _config: SandboxConfig
## Rafraîchisseurs des champs : chacun remet son champ à la valeur actuelle des réglages.
var _refreshers: Array[Callable] = []
var _built: bool = false

@onready var _forest_option: OptionButton = %ForestOption
@onready var _seed_edit: LineEdit = %SeedEdit
@onready var _seed_button: Button = %SeedButton
@onready var _economy_grid: GridContainer = %EconomyGrid
@onready var _zones_grid: GridContainer = %ZonesGrid
@onready var _tiers_grid: GridContainer = %TiersGrid
@onready var _construction_grid: GridContainer = %ConstructionGrid
@onready var _buildings_grid: GridContainer = %BuildingsGrid


func _ready() -> void:
	_forest_option.item_selected.connect(_on_forest_selected)
	_seed_button.pressed.connect(_on_new_seed)
	_seed_edit.text_changed.connect(_on_seed_edited)
	if _config != null:
		_show_config()


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready() and _config != null:
		_fill_forests()


## Réglages affichés et modifiés par le formulaire (le formulaire les modifie en place).
## Peut être appelé avant l'entrée dans l'arbre : l'affichage suit alors à _ready().
func set_config(config: SandboxConfig) -> void:
	_config = config
	if is_node_ready():
		_show_config()


func _show_config() -> void:
	if not _built:
		_build_fields()
		_built = true
	_fill_forests()
	refresh()


## Réglages actuels.
func config() -> SandboxConfig:
	return _config


## Remet chaque champ à la valeur des réglages.
func refresh() -> void:
	_forest_option.select(maxi(0, FOREST_MODES.find(_config.mode.id)))
	_seed_edit.text = str(_config.game_seed)
	for refresh_field: Callable in _refreshers:
		refresh_field.call()


## Texte des problèmes des réglages (vide si tout va bien), déjà traduit.
func problems_text() -> String:
	if not _seed_edit.text.strip_edges().is_valid_int():
		return tr("SANDBOX_INVALID") % tr("SANDBOX_SEED")
	var problems: PackedStringArray = _config.defs.validate()
	if problems.is_empty():
		return ""
	var labels := PackedStringArray()
	for problem: String in problems:
		var key: String = PROBLEM_KEYS.get(problem, problem)
		var label: String = tr(key)
		if not labels.has(label):
			labels.append(label)
	return tr("SANDBOX_INVALID") % ", ".join(labels)


## Graine aléatoire (aléatoire de l'interface, hors simulation).
static func random_seed() -> int:
	return randi() % 1_000_000_000


func _fill_forests() -> void:
	_forest_option.clear()
	for mode_id: StringName in FOREST_MODES:
		_forest_option.add_item(tr(SceneRouter.MODES[mode_id].name_key))
	_forest_option.select(maxi(0, FOREST_MODES.find(_config.mode.id)))


# --- Construction des champs ---


func _build_fields() -> void:
	var defs: SimDefs = _config.defs
	var params: Array[SandboxParam] = SandboxParam.all(
		defs.zone_count(), defs.tier_cells.size(), defs.buildings
	)
	_buildings_grid.columns = defs.buildings.size() + 1
	_buildings_grid.add_child(Control.new())
	for building: SimBuilding in defs.buildings:
		var header := Label.new()
		header.text = building.name_key
		header.theme_type_variation = &"SmallHintLabel"
		header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		header.custom_minimum_size = Vector2(BUILDING_FIELD_WIDTH, 0.0)
		header.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_buildings_grid.add_child(header)
	_add_headers(
		_zones_grid,
		["SANDBOX_ZONE", "SANDBOX_RICHNESS", "SANDBOX_ZONE_COST", "SANDBOX_ZONE_GROWTH"]
	)
	_add_headers(_tiers_grid, ["SANDBOX_TIER", "SANDBOX_TIER_CELLS", "SANDBOX_TIER_PRODUCTION"])
	var last_row: int = -1
	for param: SandboxParam in params:
		match param.group:
			SandboxParam.Group.ECONOMY:
				var label := Label.new()
				label.text = param.label_key
				label.theme_type_variation = &"SmallLabel"
				label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				_economy_grid.add_child(label)
				_economy_grid.add_child(_field(param))
			SandboxParam.Group.ZONES:
				if param.index != last_row:
					last_row = param.index
					_add_index_label(_zones_grid, param.index + 1)
				_zones_grid.add_child(_field(param))
			SandboxParam.Group.TIERS:
				if param.index != last_row:
					last_row = param.index
					_add_index_label(_tiers_grid, param.index + 1)
				_tiers_grid.add_child(_field(param))
			SandboxParam.Group.CONSTRUCTION, SandboxParam.Group.BUILD_TIMES:
				_add_row_label(_construction_grid, param.label())
				_construction_grid.add_child(_field(param))
			SandboxParam.Group.BUILDINGS:
				if param.index == 0:
					_add_row_label(_buildings_grid, param.label_key)
				var spin: SpinBox = _field(param)
				spin.custom_minimum_size = Vector2(BUILDING_FIELD_WIDTH, 0.0)
				_buildings_grid.add_child(spin)


## Champ d'un réglage : il modifie les réglages quand le joueur change sa valeur, et suit les
## réglages quand ils sont remplacés (valeurs par défaut).
func _field(param: SandboxParam) -> SpinBox:
	var spin := SpinBox.new()
	spin.min_value = param.low
	spin.max_value = param.high
	spin.step = param.step
	spin.custom_minimum_size = Vector2(FIELD_WIDTH, 0.0)
	spin.select_all_on_focus = true
	spin.get_line_edit().add_theme_font_size_override(&"font_size", FIELD_FONT_SIZE)
	_refreshers.append(func() -> void: spin.set_value_no_signal(param.read(_config.defs)))
	spin.value_changed.connect(func(value: float) -> void: param.write(_config.defs, value))
	return spin


## Libellé d'une ligne (une clé de traduction ou un texte déjà traduit).
func _add_row_label(grid: GridContainer, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.theme_type_variation = &"SmallLabel"
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_child(label)


func _add_headers(grid: GridContainer, keys: Array[String]) -> void:
	for key: String in keys:
		var header := Label.new()
		header.text = key
		header.theme_type_variation = &"SmallHintLabel"
		header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		grid.add_child(header)


func _add_index_label(grid: GridContainer, number: int) -> void:
	var label := Label.new()
	label.text = str(number)
	label.theme_type_variation = &"SmallLabel"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	grid.add_child(label)


# --- Actions ---


func _on_forest_selected(index: int) -> void:
	var mode: ModeDef = SceneRouter.MODES[FOREST_MODES[index]]
	_config.mode = mode
	_config.defs.mode_id = mode.id
	_config.defs.sectors = mode.colonies
	_config.defs.rings_per_zone = mode.rings_per_zone


func _on_new_seed() -> void:
	_config.game_seed = random_seed()
	_seed_edit.text = str(_config.game_seed)


func _on_seed_edited(text: String) -> void:
	if text.strip_edges().is_valid_int():
		_config.game_seed = text.strip_edges().to_int()
