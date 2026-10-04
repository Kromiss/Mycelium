extends Control
## Écran de réglages du Bac à sable (GDD §2.1 bis) : forêt, graine et tous les chiffres de
## l'économie, des zones et des paliers. Chaque arrivée sur cet écran repart des valeurs par
## défaut ; « Valeurs par défaut » les remet à tout moment.

const FOREST_MODES: Array[StringName] = [&"duel", &"ffa"]
const FIELD_WIDTH: float = 140.0
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
}

var _config: SandboxConfig
## Rafraîchisseurs des champs : chacun remet son champ à la valeur actuelle des réglages.
var _refreshers: Array[Callable] = []

@onready var _forest_option: OptionButton = %ForestOption
@onready var _seed_edit: LineEdit = %SeedEdit
@onready var _seed_button: Button = %SeedButton
@onready var _economy_grid: GridContainer = %EconomyGrid
@onready var _zones_grid: GridContainer = %ZonesGrid
@onready var _tiers_grid: GridContainer = %TiersGrid
@onready var _error_label: Label = %ErrorLabel
@onready var _back_button: Button = %BackButton
@onready var _defaults_button: Button = %DefaultsButton
@onready var _launch_button: Button = %LaunchButton


func _ready() -> void:
	var existing: SandboxConfig = SceneRouter.sandbox_config
	_config = existing.duplicate_config() if existing != null else _default_config(&"duel")
	_build_fields()
	_fill_forests()
	_forest_option.item_selected.connect(_on_forest_selected)
	_seed_button.pressed.connect(_on_new_seed)
	_back_button.pressed.connect(SceneRouter.goto_main_menu)
	_defaults_button.pressed.connect(_on_defaults)
	_launch_button.pressed.connect(_on_launch)
	_refresh()
	_launch_button.grab_focus()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready():
		_fill_forests()


## Réglages actuellement affichés (lus par les tests).
func config() -> SandboxConfig:
	return _config


func _default_config(mode_id: StringName) -> SandboxConfig:
	return SandboxConfig.defaults(SceneRouter.MODES[mode_id], _random_seed())


func _random_seed() -> int:
	# Aléatoire de l'interface, hors simulation : il ne sert qu'à proposer une graine.
	return randi() % 1_000_000_000


func _fill_forests() -> void:
	_forest_option.clear()
	for mode_id: StringName in FOREST_MODES:
		_forest_option.add_item(tr(SceneRouter.MODES[mode_id].name_key))
	_forest_option.select(maxi(0, FOREST_MODES.find(_config.mode.id)))


func _refresh() -> void:
	_forest_option.select(maxi(0, FOREST_MODES.find(_config.mode.id)))
	_seed_edit.text = str(_config.game_seed)
	for refresh: Callable in _refreshers:
		refresh.call()
	_error_label.text = ""


# --- Construction des champs ---


func _build_fields() -> void:
	_add_economy_row("SANDBOX_UNIT_COST", 0.001, 1_000_000.0, 0.001, &"unit_cost", 1000.0)
	_add_economy_row("SANDBOX_CELL_YIELD", 0.0, 1_000_000.0, 0.001, &"cell_yield", 1000.0)
	_add_economy_row("SANDBOX_GROWTH", 1.0, 600.0, 1.0, &"base_growth_ticks", 1.0)
	_add_economy_row("SANDBOX_START_STOCK", 0.0, 100_000.0, 1.0, &"start_stock_units", 1.0)
	_add_economy_row("SANDBOX_COST_GROWTH", 1.0, 5.0, 0.001, &"colonize_cost_growth_pm", 1000.0)
	_add_economy_row("SANDBOX_COHESION", 0.0, 100.0, 0.1, &"cohesion_per_neighbor_pm", 10.0)
	_add_economy_row("SANDBOX_MAX_GROWTHS", 1.0, 20.0, 1.0, &"max_growths", 1.0)
	_add_economy_row("SANDBOX_QUEUE", 1.0, 50.0, 1.0, &"expansion_queue_size", 1.0)
	_add_headers(
		_zones_grid,
		["SANDBOX_ZONE", "SANDBOX_RICHNESS", "SANDBOX_ZONE_COST", "SANDBOX_ZONE_GROWTH"]
	)
	for zone: int in range(_config.defs.zone_count()):
		_add_index_label(_zones_grid, zone + 1)
		for property: StringName in [&"zone_richness_pm", &"zone_cost_pm", &"zone_growth_pm"]:
			_zones_grid.add_child(_array_field(property, zone, 0.0, 1000.0, 0.001, 1000.0))
	_add_headers(_tiers_grid, ["SANDBOX_TIER", "SANDBOX_TIER_CELLS", "SANDBOX_TIER_PRODUCTION"])
	for tier: int in range(_config.defs.tier_cells.size()):
		_add_index_label(_tiers_grid, tier + 1)
		_tiers_grid.add_child(_array_field(&"tier_cells", tier, 1.0, 10_000.0, 1.0, 1.0))
		_tiers_grid.add_child(
			_array_field(&"tier_production_pm", tier, 0.0, 1_000_000.0, 0.001, 1000.0)
		)


## Une ligne « libellé : champ » de l'économie. « scale » : unités de la simulation par unité
## affichée (1000 pour des millièmes ou des pour-mille, 10 pour des pour-mille en pour-cent).
func _add_economy_row(
	key: String, low: float, high: float, step: float, property: StringName, scale: float
) -> void:
	var label := Label.new()
	label.text = key
	label.theme_type_variation = &"SmallLabel"
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_economy_grid.add_child(label)
	var spin: SpinBox = _spin(low, high, step)
	var getter: Callable = func() -> float:
		var raw: int = _config.defs.get(property)
		return float(raw) / scale
	var setter: Callable = func(value: float) -> void:
		_config.defs.set(property, roundi(value * scale))
	_bind(spin, getter, setter)
	_economy_grid.add_child(spin)


## Champ d'une case d'un tableau des réglages (zones, paliers).
func _array_field(
	property: StringName, index: int, low: float, high: float, step: float, scale: float
) -> SpinBox:
	var spin: SpinBox = _spin(low, high, step)
	var getter: Callable = func() -> float:
		var values: PackedInt32Array = _config.defs.get(property)
		return float(values[index]) / scale
	var setter: Callable = func(value: float) -> void:
		var values: PackedInt32Array = _config.defs.get(property)
		values[index] = roundi(value * scale)
		_config.defs.set(property, values)
	_bind(spin, getter, setter)
	return spin


func _spin(low: float, high: float, step: float) -> SpinBox:
	var spin := SpinBox.new()
	spin.min_value = low
	spin.max_value = high
	spin.step = step
	spin.custom_minimum_size = Vector2(FIELD_WIDTH, 0.0)
	spin.select_all_on_focus = true
	spin.get_line_edit().add_theme_font_size_override(&"font_size", FIELD_FONT_SIZE)
	return spin


## Relie un champ aux réglages : il les modifie quand le joueur change sa valeur, et suit les
## réglages quand ils sont remis aux valeurs par défaut.
func _bind(spin: SpinBox, getter: Callable, setter: Callable) -> void:
	_refreshers.append(
		func() -> void:
			var value: float = getter.call()
			spin.set_value_no_signal(value)
	)
	spin.value_changed.connect(func(value: float) -> void: setter.call(value))


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
	_config.game_seed = _random_seed()
	_seed_edit.text = str(_config.game_seed)


func _on_defaults() -> void:
	_config = _default_config(_config.mode.id)
	_refresh()


func _on_launch() -> void:
	var text: String = _seed_edit.text.strip_edges()
	if not text.is_valid_int():
		_error_label.text = tr("SANDBOX_INVALID") % tr("SANDBOX_SEED")
		return
	_config.game_seed = text.to_int()
	var problems: PackedStringArray = _config.defs.validate()
	if not problems.is_empty():
		var labels := PackedStringArray()
		for problem: String in problems:
			var key: String = PROBLEM_KEYS.get(problem, problem)
			var label: String = tr(key)
			if not labels.has(label):
				labels.append(label)
		_error_label.text = tr("SANDBOX_INVALID") % ", ".join(labels)
		return
	SceneRouter.start_sandbox(_config.duplicate_config())
