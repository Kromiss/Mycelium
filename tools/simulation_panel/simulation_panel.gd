extends Control
## Panneau de simulations (GDD §18.5, Architecture §11.3) : outil d'équilibrage, ouvert depuis
## le menu principal seulement quand le jeu est lancé depuis l'éditeur ; il est dans tools/,
## exclu des exports. Trois onglets :
## - Réglages : les réglages du Bac à sable (formulaire partagé, sans les adversaires) ;
## - Lancement : compositions de forêt (un profil de robot par secteur, gardées d'une session à
##   l'autre), nombre de parties, durée simulée, lancement simple ou balayage d'un réglage ;
## - Résultats : un tableau par série (mesures de la partie, puis une colonne par secteur),
##   courbes par minute, export CSV, et partie regardée sur la carte (×1 à ×64, pause).

const FORM_SCENE: PackedScene = preload("res://ui/sandbox/settings_form.tscn")
const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const DEFAULT_RUNS: int = 10
const DEFAULT_MINUTES: int = 30
const SECONDS_PER_MINUTE: int = 60
const CSV_NAME: String = "user://simulations_%s.csv"
const TAB_KEYS: Array[String] = ["SIM_TAB_SETTINGS", "SIM_TAB_LAUNCH", "SIM_TAB_RESULTS"]
const CURVE_KEYS: Array[String] = ["SIM_CURVE_PRODUCTION", "SIM_CURVE_CELLS"]

## Fichier des compositions (les tests en donnent un autre).
var compositions_path: String = CompositionList.PATH

var _form: SettingsForm
var _tabs: TabContainer
var _compositions: CompositionList
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
var _tables: VBoxContainer
var _curve_option: OptionButton
var _curves: CurvesChart
var _export_label: Label
var _watch_series: OptionButton
var _watch_run: SpinBox
var _runner: SimRunner
var _running: bool = false
var _params: Array[SandboxParam] = []
var _started_at: int = 0


func _ready() -> void:
	_build()
	_restore()
	_refresh_results()


func _process(_delta: float) -> void:
	if _runner == null or not _running:
		return
	_progress.value = _runner.progress()
	var done: int = roundi(_runner.progress() * _runner.job_count())
	_status.text = tr("SIM_RUNNING") % [done, _runner.job_count()]
	if _runner.is_finished():
		_running = false
		_start_button.disabled = false
		var seconds: float = (Time.get_ticks_msec() - _started_at) / 1000.0
		_status.text = tr("SIM_DONE") % [_runner.job_count(), String.num(seconds, 1)]
		_refresh_results()
		_tabs.current_tab = 2


func _exit_tree() -> void:
	# On attend les parties en cours avant de quitter l'écran.
	if _runner != null and _running:
		while not _runner.is_finished():
			OS.delay_msec(5)
		_running = false
	_save()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


## Lot de parties en cours ou terminé (lu par les tests).
func runner() -> SimRunner:
	return _runner


## Vrai pendant que des parties tournent.
func is_running() -> bool:
	return _running


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
	for tab: int in range(TAB_KEYS.size()):
		_tabs.set_tab_title(tab, tr(TAB_KEYS[tab]))


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
	_form.set_config(GameConfig.defaults(DUEL, 1))
	_form.show_opponents(false)
	_form.forest_changed.connect(_on_forest_changed)
	var defaults := Button.new()
	defaults.text = "SANDBOX_DEFAULTS"
	defaults.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	defaults.pressed.connect(_on_defaults)
	box.add_child(defaults)
	return scroll


func _launch_tab() -> Control:
	# Défilant : la liste des compositions peut être longue.
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
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
	_compositions = CompositionList.new()
	_compositions.load_lists(compositions_path)
	_add_row(grid, "SIM_COMPOSITIONS", _compositions)
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
	_sweep_option.custom_minimum_size = Vector2(420.0, 0.0)
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
	_on_forest_changed()
	_update_sweep_fields()
	return scroll


func _results_tab() -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", 12)
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override(&"separation", 12)
	box.add_child(actions)
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
	_export_label.clip_text = true
	actions.add_child(_export_label)
	_watch_series = OptionButton.new()
	_watch_series.custom_minimum_size = Vector2(320.0, 0.0)
	_watch_series.clip_text = true
	actions.add_child(_watch_series)
	_watch_run = _spin(1.0, 1.0, 1.0, 1.0)
	_watch_run.prefix = tr("SIM_WATCH_RUN")
	actions.add_child(_watch_run)
	var watch := Button.new()
	watch.text = "SIM_WATCH"
	watch.theme_type_variation = &"SmallButton"
	watch.pressed.connect(_on_watch)
	actions.add_child(watch)
	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(split)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_stretch_ratio = 1.4
	split.add_child(scroll)
	_tables = VBoxContainer.new()
	_tables.add_theme_constant_override(&"separation", 24)
	scroll.add_child(_tables)
	var right_scroll := ScrollContainer.new()
	right_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	split.add_child(right_scroll)
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_scroll.add_child(right)
	_curve_option = OptionButton.new()
	for key: String in CURVE_KEYS:
		_curve_option.add_item(tr(key))
	_curve_option.item_selected.connect(func(_index: int) -> void: _refresh_curves())
	right.add_child(_curve_option)
	_curves = CurvesChart.new()
	_curves.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_curves.custom_minimum_size = Vector2(300.0, 300.0)
	right.add_child(_curves)
	return box


func _add_row(grid: GridContainer, key: String, field: Control) -> void:
	var label := Label.new()
	label.text = key
	label.theme_type_variation = &"SmallLabel"
	label.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
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


func _on_forest_changed() -> void:
	var config: GameConfig = _form.config()
	_compositions.set_forest(config.mode.id, config.defs.sectors)
	_fill_sweep_params()


func _fill_sweep_params() -> void:
	var defs: SimDefs = _form.config().defs
	_params = SandboxParam.all(defs)
	_sweep_option.clear()
	for param: SandboxParam in _params:
		_sweep_option.add_item(param.full_label(defs))
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


## Lance le lot (« threaded » faux : à la suite, pour les tests).
func start(threaded: bool = true) -> void:
	var problems: String = _form.problems_text()
	if not problems.is_empty():
		_status.text = problems
		return
	var config: GameConfig = _form.config()
	_runner = SimRunner.new()
	var duration: int = roundi(_minutes_spin.value) * SECONDS_PER_MINUTE
	var runs: int = roundi(_runs_spin.value)
	var compositions: Array[Array] = _compositions.compositions()
	if _mode_option.selected == 1:
		var param: SandboxParam = _params[_sweep_option.selected]
		_runner.setup(
			config.defs,
			compositions,
			runs,
			config.game_seed,
			duration,
			param,
			_sweep_min.value,
			_sweep_max.value,
			_sweep_step.value
		)
	else:
		_runner.setup(config.defs, compositions, runs, config.game_seed, duration)
	if _runner.job_count() == 0:
		_runner = null
		_status.text = tr("SIM_NO_COMPOSITION")
		return
	_start_button.disabled = true
	_running = true
	_progress.value = 0.0
	_started_at = Time.get_ticks_msec()
	if threaded:
		_runner.start()
	else:
		_runner.run_all()
		_process(0.0)


func _on_start() -> void:
	start()


func _on_defaults() -> void:
	var config: GameConfig = _form.config()
	_form.set_config(GameConfig.defaults(config.mode, config.game_seed))
	_on_forest_changed()


# --- Résultats ---


func _has_results() -> bool:
	return _runner != null and not _running and not _runner.series.is_empty()


func _refresh_results() -> void:
	for child: Node in _tables.get_children():
		# Libéré tout de suite : aucun signal de ces lignes n'est en cours.
		child.free()
	_watch_series.clear()
	if not _has_results():
		var empty := Label.new()
		empty.text = "SIM_NO_RESULTS"
		empty.theme_type_variation = &"SmallHintLabel"
		_tables.add_child(empty)
		_refresh_curves()
		return
	for one: SimRunner.Series in _runner.series:
		_tables.add_child(_series_table(one))
		_watch_series.add_item(one.label())
	_watch_run.max_value = _runner.runs
	_refresh_curves()


## Tableau d'une série : mesures de la partie, puis une colonne par secteur.
func _series_table(one: SimRunner.Series) -> Control:
	var box := VBoxContainer.new()
	box.add_theme_constant_override(&"separation", 6)
	var title := _text(one.label(), &"BoldLabel")
	box.add_child(title)
	var sectors: PackedInt32Array = one.sectors()
	var grid := GridContainer.new()
	grid.columns = sectors.size() + 1
	grid.add_theme_constant_override(&"h_separation", 18)
	grid.add_theme_constant_override(&"v_separation", 4)
	box.add_child(grid)
	for row: SimReport.Row in SimReport.game_rows(one):
		grid.add_child(_text(row.label, &"SmallLabel"))
		grid.add_child(_text(_stats_text(row.stats[0]), &"SmallLabel"))
		for column: int in range(1, sectors.size()):
			grid.add_child(Control.new())
	grid.add_child(Control.new())
	for sector: int in sectors:
		grid.add_child(_text(one.sector_label(sector), &"SmallHintLabel"))
	for row: SimReport.Row in SimReport.colony_rows(one, false):
		grid.add_child(_text(row.label, &"SmallLabel"))
		for stats: SimStats in row.stats:
			grid.add_child(_text(_stats_text(stats), &"SmallLabel"))
	return box


func _refresh_curves() -> void:
	var curves: Array[PackedFloat64Array] = []
	var labels := PackedStringArray()
	if _has_results():
		var kind: SimReport.CurveKind = _curve_option.selected as SimReport.CurveKind
		for one: SimRunner.Series in _runner.series:
			var sectors: PackedInt32Array = one.sectors()
			for column: int in range(sectors.size()):
				curves.append(SimReport.mean_curve(one, column, kind))
				labels.append("%s · %s" % [one.label(), one.sector_label(sectors[column])])
	_curves.set_curves(curves, labels, _curve_option.selected == SimReport.CurveKind.PRODUCTION)


func _text(text: String, variation: StringName) -> Label:
	var label := Label.new()
	label.text = text
	label.auto_translate_mode = Node.AUTO_TRANSLATE_MODE_DISABLED
	label.theme_type_variation = variation
	return label


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
	if not _has_results():
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


## Réglages de la partie choisie, à regarder sur la carte (les robots la rejouent à
## l'identique : même graine, même composition, mêmes réglages).
func watch_config(series_index: int, run: int) -> GameConfig:
	var one: SimRunner.Series = _runner.series[series_index]
	var config := GameConfig.new()
	config.mode = _form.config().mode
	config.game_seed = _runner.run_seed(run)
	config.defs = one.defs.duplicate_defs()
	config.defs.match_ticks = mini(config.defs.match_ticks, _runner.duration_ticks)
	config.profiles = one.profiles.duplicate()
	config.spectator = true
	config.title = tr("SIM_WATCH_TITLE") % [one.label(), run + 1]
	return config


func _on_watch() -> void:
	if not _has_results() or _watch_series.selected < 0:
		return
	var config: GameConfig = watch_config(_watch_series.selected, roundi(_watch_run.value) - 1)
	_save()
	SceneRouter.start_game(config)


# --- État gardé quand on part regarder une partie ---


func _save() -> void:
	SceneRouter.simulation_panel_state = {
		"config": _form.config(),
		"runner": _runner if not _running else null,
		"runs": _runs_spin.value,
		"minutes": _minutes_spin.value,
		"mode": _mode_option.selected,
		"sweep": _sweep_option.selected,
		"sweep_min": _sweep_min.value,
		"sweep_max": _sweep_max.value,
		"sweep_step": _sweep_step.value,
		"curve": _curve_option.selected,
		"tab": _tabs.current_tab,
	}


func _restore() -> void:
	var saved: Variant = SceneRouter.simulation_panel_state
	if not saved is Dictionary:
		return
	var state: Dictionary = saved
	var config: GameConfig = state.get("config")
	if config != null:
		_form.set_config(config)
		_on_forest_changed()
	_runner = state.get("runner")
	var runs: float = state.get("runs", DEFAULT_RUNS)
	var minutes: float = state.get("minutes", DEFAULT_MINUTES)
	var mode: int = state.get("mode", 0)
	var sweep: int = state.get("sweep", 0)
	var sweep_min: float = state.get("sweep_min", 0.0)
	var sweep_max: float = state.get("sweep_max", 0.0)
	var sweep_step: float = state.get("sweep_step", 1.0)
	var curve: int = state.get("curve", 0)
	var tab: int = state.get("tab", 0)
	_runs_spin.value = runs
	_minutes_spin.value = minutes
	_mode_option.select(mode)
	_sweep_option.select(sweep)
	_on_sweep_param_selected(sweep)
	_sweep_min.value = sweep_min
	_sweep_max.value = sweep_max
	_sweep_step.value = sweep_step
	_curve_option.select(curve)
	_update_sweep_fields()
	_tabs.current_tab = tab
