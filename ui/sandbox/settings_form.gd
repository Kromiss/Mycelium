class_name SettingsForm
extends VBoxContainer
## Formulaire des réglages du Bac à sable (GDD §2.1 bis) : forêt, graine, réglages généraux
## (économie, cases, Tourelle, partie), zones, paliers, améliorations et capacités.

const FOREST_MODES: Array[StringName] = [&"duel", &"ffa"]
const FIELD_WIDTH: float = 140.0
## Largeur des champs des tableaux (améliorations, capacités).
const TABLE_FIELD_WIDTH: float = 118.0
## Taille du texte des champs (plus petite que celle des menus, pour tout faire tenir).
const FIELD_FONT_SIZE: int = 20
## Libellé à montrer pour chaque problème signalé par SimDefs.validate().
const PROBLEM_KEYS: Dictionary[String, String] = {
	"sectors": "SANDBOX_FOREST",
	"rings_per_zone": "SANDBOX_FOREST",
	"zones": "SANDBOX_ZONES",
	"zone_hp": "SANDBOX_ZONES",
	"tiers": "SANDBOX_TIERS",
	"tier_cells": "SANDBOX_TIER_CELLS",
	"economy": "SANDBOX_GENERAL",
	"hp": "SANDBOX_GENERAL",
	"turret": "SANDBOX_GENERAL",
	"step_ticks": "SANDBOX_STEP",
	"upgrade_cost_growth_pm": "SANDBOX_COST_GROWTH",
	"match_ticks": "SANDBOX_PROTECTION",
	"mutation_choices": "SANDBOX_GENERAL",
	"upgrades": "SANDBOX_UPGRADES",
	"abilities": "SANDBOX_ABILITIES",
}

var _config: SandboxConfig
## Rafraîchisseurs des champs : chacun remet son champ à la valeur actuelle des réglages.
var _refreshers: Array[Callable] = []
var _built: bool = false

@onready var _forest_option: OptionButton = %ForestOption
@onready var _seed_edit: LineEdit = %SeedEdit
@onready var _seed_button: Button = %SeedButton
@onready var _general_grid: GridContainer = %GeneralGrid
@onready var _zones_grid: GridContainer = %ZonesGrid
@onready var _tiers_grid: GridContainer = %TiersGrid
@onready var _upgrades_grid: GridContainer = %UpgradesGrid
@onready var _abilities_grid: GridContainer = %AbilitiesGrid


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
	var grids: Dictionary[SandboxParam.Group, GridContainer] = {
		SandboxParam.Group.ZONES: _zones_grid,
		SandboxParam.Group.TIERS: _tiers_grid,
		SandboxParam.Group.UPGRADES: _upgrades_grid,
		SandboxParam.Group.ABILITIES: _abilities_grid,
	}
	var first_column: Dictionary[SandboxParam.Group, String] = {
		SandboxParam.Group.ZONES: "SANDBOX_ZONE",
		SandboxParam.Group.TIERS: "SANDBOX_TIER",
		SandboxParam.Group.UPGRADES: "SANDBOX_UPGRADE",
		SandboxParam.Group.ABILITIES: "SANDBOX_ABILITY",
	}
	for group: SandboxParam.Group in grids:
		var keys: Array[String] = [first_column[group]]
		keys.append_array(SandboxParam.columns(group))
		grids[group].columns = keys.size()
		_add_headers(grids[group], keys)
	var last_row: int = -1
	var last_group: int = -1
	for param: SandboxParam in SandboxParam.all(defs):
		if param.group == SandboxParam.Group.GENERAL:
			_add_row_label(_general_grid, param.label_key)
			_general_grid.add_child(_field(param))
			continue
		var grid: GridContainer = grids[param.group]
		if param.index != last_row or param.group != last_group:
			last_row = param.index
			last_group = param.group
			_add_row_label(grid, _row_name(defs, param))
		var spin: SpinBox = _field(param)
		if (
			param.group == SandboxParam.Group.UPGRADES
			or param.group == SandboxParam.Group.ABILITIES
		):
			spin.custom_minimum_size = Vector2(TABLE_FIELD_WIDTH, 0.0)
		grid.add_child(spin)


## Nom d'une ligne de tableau : numéro de la zone ou du palier, nom de l'amélioration ou de
## la capacité (clé de traduction).
func _row_name(defs: SimDefs, param: SandboxParam) -> String:
	match param.group:
		SandboxParam.Group.UPGRADES:
			return defs.upgrades[param.index].name_key
		SandboxParam.Group.ABILITIES:
			return defs.abilities[param.index].name_key
	return str(param.index + 1)


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
