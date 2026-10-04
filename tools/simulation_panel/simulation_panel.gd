extends Control
## Panneau de simulations (GDD §14.5, Architecture §11.3) : outil d'équilibrage, ouvert depuis
## le menu principal seulement quand le jeu est lancé depuis l'éditeur ; il est dans tools/,
## exclu des exports. Trois onglets :
## - Réglages : les réglages du Bac à sable (formulaire partagé) ;
## - Lancement : profils cochés, nombre de parties, durée simulée, lancement simple ou balayage ;
## - Résultats : tableau (une colonne par série), courbes, export CSV, rejeu sur la carte.

const FORM_SCENE: PackedScene = preload("res://ui/sandbox/settings_form.tscn")
const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const DEFAULT_RUNS: int = 10
const DEFAULT_MINUTES: int = 30
const SECONDS_PER_MINUTE: int = 60
const CSV_NAME: String = "user://simulations_%s.csv"
const TABLE_WIDTH: float = 0.0

var _form: SettingsForm
var _tabs: TabContainer
var _profile_boxes: Array[CheckBox] = []
var _runs_spin: SpinBox
var _minutes_spin: SpinBox
var _mode_option: OptionButton
var _sweep_option: OptionButton
var _sweep_min: SpinBox
var _sweep_max: SpinBox
var _sweep_step: SpinBox
var _start_button: Button
var _progress: ProgressBar
var _status: Label
var _results_box: VBoxContainer
var _table: GridContainer
var _curves: CurvesChart
var _export_label: Label
var _replay_series: OptionButton
var _replay_run: SpinBox
var _runner: SimRunner
var _params: Array[SandboxParam] = []
var _started_at: int = 0


func _ready() -> void:
	_build()
	_restore()
	_refresh_results()


func _process(_delta: float) -> void:
	if _runner == null or _start_button.disabled == false:
		return
	_progress.value = _runner.progress()
	var done: int = roundi(_runner.progress() * _runner.job_count())
	_status.text = tr("SIM_RUNNING") % [done, _runner.job_count()]
	if _runner.is_finished():
		_start_button.disabled = false
		var seconds: float = (Time.get_ticks_msec() - _started_at) / 1000.0
		_status.text = tr("SIM_DONE") % [_runner.job_count(), String.num(seconds, 1)]
		_refresh_results()
		_tabs.current_tab = 2


func _exit_tree() -> void:
	# On attend les parties en cours avant de quitter l'écran.
	if _runner != null:
		while not _runner.is_finished():
			OS.delay_msec(5)
	_save()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


# --- Construction ---


func _build() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 16)
	margin.add_child(column)
	var header := HBoxContainer.new()
	column.add_child(header)
	var title := Label.new()
	title.text = "SIM_TITLE"
	title.theme_type_variation = &"HeaderLabel"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var back := Button.new()
	back.text = "SIM_BACK"
	back.pressed.connect(SceneRouter.goto_main_menu)
	header.add_child(back)
	_tabs = TabContainer.new()
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_tabs)
	_tabs.add_child(_settings_tab())
	_tabs.add_child(_launch_tab())
	_tabs.add_child(_results_tab())
	for tab: int in range(3):
		var keys: Array[String] = ["SIM_TAB_SETTINGS", "SIM_TAB_LAUNCH", "SIM_TAB_RESULTS"]
		_tabs.set_tab_title(tab, tr(keys[tab]))


func _settings_tab() -> Control:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", 16)
	center.add_child(box)
	_form = FORM_SCENE.instantiate()
	box.add_child(_form)
	_form.set_config(SandboxConfig.defaults(DUEL, 1))
	var defaults := Button.new()
	defaults.text = "SANDBOX_DEFAULTS"
	defaults.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	defaults.pressed.connect(_on_defaults)
	box.add_child(defaults)
	return scroll


func _launch_tab() -> Control:
	var center := CenterContainer.new()
	var card := PanelContainer.new()
	card.theme_type_variation = &"HudPanel"
	center.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", 14)
	card.add_child(box)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override(&"h_separation", 24)
	grid.add_theme_constant_override(&"v_separation", 10)
	box.add_child(grid)
	var profiles := VBoxContainer.new()
	for key: String in EconomyRobot.PROFILE_KEYS:
		var check := CheckBox.new()
		check.text = key
		check.button_pressed = true
		profiles.add_child(check)
		_profile_boxes.append(check)
	_add_row(grid, "SIM_PROFILES", profiles)
	_runs_spin = _spin(1.0, 1000.0, 1.0, DEFAULT_RUNS)
	_add_row(grid, "SIM_RUNS", _runs_spin)
	_minutes_spin = _spin(1.0, 30.0, 1.0, DEFAULT_MINUTES)
	_add_row(grid, "SIM_DURATION", _minutes_spin)
	_mode_option = OptionButton.new()
	_mode_option.add_item(tr("SIM_MODE_SIMPLE"))
	_mode_option.add_item(tr("SIM_MODE_SWEEP"))
	_mode_option.item_selected.connect(func(_index: int) -> void: _update_sweep_fields())
	_add_row(grid, "SIM_MODE", _mode_option)
	_sweep_option = OptionButton.new()
	_sweep_option.item_selected.connect(_on_sweep_param_selected)
	_add_row(grid, "SIM_SWEEP_VALUE", _sweep_option)
	_sweep_min = _spin(0.0, 1_000_000.0, 0.001, 0.0)
	_add_row(grid, "SIM_SWEEP_MIN", _sweep_min)
	_sweep_max = _spin(0.0, 1_000_000.0, 0.001, 0.0)
	_add_row(grid, "SIM_SWEEP_MAX", _sweep_max)
	_sweep_step = _spin(0.001, 1_000_000.0, 0.001, 1.0)
	_add_row(grid, "SIM_SWEEP_STEP", _sweep_step)
	_start_button = Button.new()
	_start_button.text = "SIM_START"
	_start_button.pressed.connect(_on_start)
	box.add_child(_start_button)
	_progress = ProgressBar.new()
	_progress.max_value = 1.0
	_progress.step = 0.0
	_progress.show_percentage = false
	_progress.custom_minimum_size = Vector2(0.0, 14.0)
	box.add_child(_progress)
	_status = Label.new()
	_status.theme_type_variation = &"SmallHintLabel"
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(_status)
	_fill_sweep_params()
	_update_sweep_fields()
	return center


func _results_tab() -> Control:
	_results_box = VBoxContainer.new()
	_results_box.add_theme_constant_override(&"separation", 12)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override(&"separation", 12)
	_results_box.add_child(actions)
	var export := Button.new()
	export.text = "SIM_EXPORT"
	export.theme_type_variation = &"SmallButton"
	export.pressed.connect(_on_export)
	actions.add_child(export)
	var folder := Button.new()
	folder.text = "SIM_OPEN_FOLDER"
	folder.theme_type_variation = &"SmallButton"
	folder.pressed.connect(func() -> void: OS.shell_open(ProjectSettings.globalize_path("user://")))
	actions.add_child(folder)
	_export_label = Label.new()
	_export_label.theme_type_variation = &"SmallHintLabel"
	_export_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(_export_label)
	_replay_series = OptionButton.new()
	actions.add_child(_replay_series)
	_replay_run = _spin(1.0, 1.0, 1.0, 1.0)
	actions.add_child(_replay_run)
	var replay := Button.new()
	replay.text = "SIM_REPLAY"
	replay.theme_type_variation = &"SmallButton"
	replay.pressed.connect(_on_replay)
	actions.add_child(replay)
	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_results_box.add_child(split)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_stretch_ratio = 1.4
	split.add_child(scroll)
	_table = GridContainer.new()
	_table.add_theme_constant_override(&"h_separation", 18)
	_table.add_theme_constant_override(&"v_separation", 4)
	scroll.add_child(_table)
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(right)
	var curves_title := Label.new()
	curves_title.text = "SIM_CURVES"
	curves_title.theme_type_variation = &"SmallHintLabel"
	right.add_child(curves_title)
	_curves = CurvesChart.new()
	_curves.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_curves.custom_minimum_size = Vector2(300.0, 300.0)
	right.add_child(_curves)
	return _results_box


func _add_row(grid: GridContainer, key: String, field: Control) -> void:
	var label := Label.new()
	label.text = key
	label.theme_type_variation = &"SmallLabel"
	grid.add_child(label)
	grid.add_child(field)


func _spin(low: float, high: float, step: float, value: float) -> SpinBox:
	var spin := SpinBox.new()
	spin.min_value = low
	spin.max_value = high
	spin.step = step
	spin.value = value
	spin.custom_minimum_size = Vector2(160.0, 0.0)
	spin.select_all_on_focus = true
	return spin


# --- Lancement ---


func _fill_sweep_params() -> void:
	var defs: SimDefs = _form.config().defs
	_params = SandboxParam.all(defs.zone_count(), defs.tier_cells.size())
	_sweep_option.clear()
	for param: SandboxParam in _params:
		_sweep_option.add_item(param.label())
	_on_sweep_param_selected(0)


func _on_sweep_param_selected(index: int) -> void:
	var param: SandboxParam = _params[index]
	var current: float = param.read(_form.config().defs)
	for spin: SpinBox in [_sweep_min, _sweep_max]:
		spin.min_value = param.low
		spin.max_value = param.high
		spin.step = param.step
	_sweep_step.step = param.step
	_sweep_step.min_value = param.step
	_sweep_min.value = current
	_sweep_max.value = current
	_sweep_step.value = maxf(param.step, 1.0 if param.step >= 1.0 else param.step * 10.0)


func _update_sweep_fields() -> void:
	var sweep: bool = _mode_option.selected == 1
	_sweep_option.disabled = not sweep
	for spin: SpinBox in [_sweep_min, _sweep_max, _sweep_step]:
		spin.editable = sweep


## Profils cochés.
func _checked_profiles() -> Array[int]:
	var profiles: Array[int] = []
	for index: int in range(_profile_boxes.size()):
		if _profile_boxes[index].button_pressed:
			profiles.append(index)
	return profiles


func _on_start() -> void:
	var problems: String = _form.problems_text()
	if not problems.is_empty():
		_status.text = problems
		return
	var profiles: Array[int] = _checked_profiles()
	if profiles.is_empty():
		_status.text = tr("SIM_NO_PROFILE")
		return
	var config: SandboxConfig = _form.config()
	_runner = SimRunner.new()
	var duration: int = roundi(_minutes_spin.value) * SECONDS_PER_MINUTE
	var runs: int = roundi(_runs_spin.value)
	if _mode_option.selected == 1:
		var param: SandboxParam = _params[_sweep_option.selected]
		_runner.setup(
			config.defs,
			profiles,
			runs,
			config.game_seed,
			duration,
			param,
			_sweep_min.value,
			_sweep_max.value,
			_sweep_step.value
		)
	else:
		_runner.setup(config.defs, profiles, runs, config.game_seed, duration)
	_start_button.disabled = true
	_progress.value = 0.0
	_started_at = Time.get_ticks_msec()
	_runner.start()


func _on_defaults() -> void:
	_form.set_config(SandboxConfig.defaults(_form.config().mode, _form.config().game_seed))


# --- Résultats ---


func _refresh_results() -> void:
	for child: Node in _table.get_children():
		child.queue_free()
	_replay_series.clear()
	var has_results: bool = _runner != null and _start_button.disabled == false
	if not has_results or _runner.series.is_empty() or _runner.series[0].results[0] == null:
		_table.columns = 1
		var empty := Label.new()
		empty.text = "SIM_NO_RESULTS"
		empty.theme_type_variation = &"SmallHintLabel"
		_table.add_child(empty)
		_curves.set_curves([], PackedStringArray())
		return
	var series: Array[SimRunner.Series] = _runner.series
	_table.columns = series.size() + 1
	_table_cell("", true)
	for one: SimRunner.Series in series:
		_table_cell(one.label(), true)
	for row: SimReport.Row in SimReport.rows(series, false):
		_table_cell(row.label, false)
		for stats: SimStats in row.stats:
			_table_cell(_stats_text(stats), false)
	var curves: Array[PackedFloat64Array] = []
	var labels := PackedStringArray()
	for one: SimRunner.Series in series:
		curves.append(SimReport.mean_curve(one))
		labels.append(one.label())
		_replay_series.add_item(one.label())
	_curves.set_curves(curves, labels)
	_replay_run.max_value = _runner.runs


func _table_cell(text: String, header: bool) -> void:
	var label := Label.new()
	label.text = text
	label.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	label.theme_type_variation = &"SmallHintLabel" if header else &"SmallLabel"
	label.custom_minimum_size = Vector2(TABLE_WIDTH if not header else 0.0, 0.0)
	_table.add_child(label)


## « moyenne (min – max, σ écart) », une décimale ; « — » si la mesure n'existe jamais.
func _stats_text(stats: SimStats) -> String:
	if stats.count == 0:
		return tr("SIM_NEVER")
	var text: String = (
		tr("SIM_CELL_STATS")
		% [
			_short(stats.mean),
			_short(stats.minimum),
			_short(stats.maximum),
			_short(stats.deviation)
		]
	)
	if stats.count < stats.total:
		text += " [%d/%d]" % [stats.count, stats.total]
	return text


## Nombre court : une décimale, ou suffixes K, M… au-delà de 1000.
static func _short(value: float) -> String:
	if absf(value) >= 1000.0:
		return NumberFormat.amount(roundi(value * Fixed.ONE))
	return NumberFormat.decimal(roundi(value * 10.0) * 100)


func _on_export() -> void:
	if _runner == null or _runner.series.is_empty():
		return
	var stamp: String = Time.get_datetime_string_from_system().replace(":", "-")
	var path: String = CSV_NAME % stamp
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		_export_label.text = error_string(FileAccess.get_open_error())
		return
	file.store_string(SimReport.to_csv(_runner.series))
	file.close()
	_export_label.text = tr("SIM_EXPORTED") % ProjectSettings.globalize_path(path)


func _on_replay() -> void:
	if _runner == null or _replay_series.selected < 0:
		return
	var one: SimRunner.Series = _runner.series[_replay_series.selected]
	var run: int = roundi(_replay_run.value) - 1
	var result: SimRunResult = one.results[run]
	if result == null or result.replay == null:
		return
	_save()
	SceneRouter.start_replay(result.replay, tr("REPLAY_TITLE") % [one.label(), run + 1])


# --- État gardé quand on part rejouer ---


func _save() -> void:
	SceneRouter.simulation_panel_state = {
		"config": _form.config(),
		"runner": _runner,
		"runs": _runs_spin.value,
		"minutes": _minutes_spin.value,
		"mode": _mode_option.selected,
		"sweep": _sweep_option.selected,
		"sweep_min": _sweep_min.value,
		"sweep_max": _sweep_max.value,
		"sweep_step": _sweep_step.value,
		"profiles": _checked_profiles(),
		"tab": _tabs.current_tab,
	}


func _restore() -> void:
	var saved: Variant = SceneRouter.simulation_panel_state
	if not saved is Dictionary:
		return
	var state: Dictionary = saved
	var config: SandboxConfig = state.get("config")
	if config != null:
		_form.set_config(config)
	_runner = state.get("runner")
	var runs: float = state.get("runs", DEFAULT_RUNS)
	var minutes: float = state.get("minutes", DEFAULT_MINUTES)
	var mode: int = state.get("mode", 0)
	var sweep: int = state.get("sweep", 0)
	var sweep_min: float = state.get("sweep_min", 0.0)
	var sweep_max: float = state.get("sweep_max", 0.0)
	var sweep_step: float = state.get("sweep_step", 1.0)
	var profiles: Array[int] = state.get("profiles", [] as Array[int])
	var tab: int = state.get("tab", 0)
	_runs_spin.value = runs
	_minutes_spin.value = minutes
	_mode_option.select(mode)
	_sweep_option.select(sweep)
	_on_sweep_param_selected(sweep)
	_sweep_min.value = sweep_min
	_sweep_max.value = sweep_max
	_sweep_step.value = sweep_step
	for index: int in range(_profile_boxes.size()):
		_profile_boxes[index].button_pressed = profiles.has(index)
	_update_sweep_fields()
	_tabs.current_tab = tab
