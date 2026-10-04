extends Node2D
## Écran d'une partie de Bac à sable (GDD §2.1 bis) : le joueur seul sur une forêt de Duel ou
## de FFA, avec la couleur Menthe. Relie la session, la carte, la colonie, les gestes, la
## caméra et le HUD ; P met en pause, Espace recentre sur le Cœur, Échap ferme le menu rond ou
## le panneau d'un bâtiment, quitte le mode palette ou ouvre le menu de partie ; 1 à 5 choisissent
## un bâtiment de la palette.

const COLORS: ColonyColors = preload("res://data/colors.tres")
## Couleur du joueur en Bac à sable (GDD §2.1 bis).
const PLAYER_COLOR: String = "COLOR_MINT"
## Zoom utilisé pour recentrer sur le Cœur, en multiple du zoom qui montre toute la forêt.
const HEART_ZOOM_FACTOR: float = 1.6
## Le Cœur est sur le bord de la forêt : on vise un peu vers le centre pour voir où s'étendre.
const HEART_FOCUS_TOWARD_CENTER: float = 0.3

var _config: SandboxConfig

@onready var _session: Session = %Session
@onready var _forest_view: ForestView = %ForestView
@onready var _colony_layer: ColonyLayer = %ColonyLayer
@onready var _building_layer: BuildingLayer = %BuildingLayer
@onready var _camera: MapCamera = %MapCamera
@onready var _input: MapInput = %MapInput
@onready var _hud: Hud = %Hud


func _ready() -> void:
	var recording: Replay = SceneRouter.replay
	if recording != null:
		# Rejeu d'une partie du panneau de simulations : mêmes réglages, mêmes commandes.
		_config = _config_of(recording)
		_session.start_replay(recording)
	else:
		_config = SceneRouter.sandbox_config
		if _config == null:
			_config = SandboxConfig.defaults(SceneRouter.MODES[&"duel"], 1)
		_session.start_local(_config.defs.duplicate_defs(), _config.game_seed, 1, true)
	var map: ForestMap = _session.simulation.state.map
	_forest_view.setup(map, Settings.palette())
	var color: int = COLORS.index_of(PLAYER_COLOR)
	_colony_layer.setup(_forest_view, _session, COLORS.main[color], COLORS.dark[color])
	_building_layer.setup(_forest_view, _session, COLORS.dark[color])
	_camera.frame(_forest_view.bounds())
	_input.setup(_session, _forest_view)
	_hud.theme = Settings.ui_theme
	_hud.setup(_session, _config, COLORS.main[color], COLORS.dark[color], SceneRouter.replay_title)
	_hud.set_cell_to_screen(_cell_to_screen)
	_session.ticked.connect(_on_ticked)
	_session.game_finished.connect(func() -> void: _input.set_placing(&""))
	_input.hovered.connect(_on_hovered)
	_input.message.connect(_hud.show_message)
	_input.placing_changed.connect(_on_placing_changed)
	_input.building_clicked.connect(_hud.open_building_panel)
	_input.build_menu_requested.connect(_hud.open_build_menu)
	_input.dismissed.connect(_hud.close_menus)
	_hud.placing_selected.connect(_input.toggle_placing)
	_hud.build_chosen.connect(
		func(cell: int, building: StringName) -> void: _input.build(cell, building)
	)
	_hud.demolish_requested.connect(_input.demolish)
	Settings.palette_changed.connect(_on_palette_changed)
	recenter()


## Réglages d'un rejeu, pour le HUD et le récapitulatif.
func _config_of(recording: Replay) -> SandboxConfig:
	var mode: ModeDef = SceneRouter.MODES.get(recording.defs.mode_id, SceneRouter.MODES[&"duel"])
	var config := SandboxConfig.new()
	config.mode = mode
	config.game_seed = recording.game_seed
	config.defs = recording.defs.duplicate_defs()
	return config


## Ramène la caméra sur le Cœur de la colonie.
func recenter() -> void:
	var heart: Vector2 = _forest_view.cell_center(_session.colony().heart)
	var center: Vector2 = _forest_view.bounds().get_center()
	_camera.focus(heart.lerp(center, HEART_FOCUS_TOWARD_CENTER), HEART_ZOOM_FACTOR)


## Position à l'écran du centre d'une case (pour le menu rond).
func _cell_to_screen(cell: int) -> Vector2:
	return get_viewport().get_canvas_transform() * _forest_view.cell_center(cell)


func _process(_delta: float) -> void:
	_input.menu_open = _hud.is_menu_open()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		if _hud.is_game_menu_open():
			_hud.close_game_menu()
		elif _hud.is_menu_open():
			_hud.close_menus()
		elif _input.placing() != &"":
			_input.set_placing(&"")
		else:
			_hud.open_game_menu()
		get_viewport().set_input_as_handled()
		return
	if _hud.is_game_menu_open():
		return
	if not _session.is_replay() and _palette_shortcut(event):
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("toggle_pause"):
		_session.set_paused(not _session.paused)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("recenter_camera"):
		recenter()
		get_viewport().set_input_as_handled()


## Touches 1 à 5 : choisit (ou quitte) un bâtiment de la palette. Vrai si la touche a servi.
func _palette_shortcut(event: InputEvent) -> bool:
	var buildings: Array[SimBuilding] = _session.simulation.state.defs.buildings
	for index: int in range(mini(buildings.size(), BuildingPalette.SHORTCUTS)):
		if event.is_action_pressed(BuildingPalette.shortcut_action(index)):
			_input.toggle_placing(buildings[index].id)
			return true
	return false


func _on_ticked(result: TickResult) -> void:
	_colony_layer.refresh()
	_building_layer.refresh()
	for i: int in range(0, result.tier_changes.size(), 3):
		var raised: bool = result.tier_changes[i + 2] > result.tier_changes[i + 1]
		if result.tier_changes[i] == _session.local_colony and raised:
			_colony_layer.jump_heart()


func _on_hovered(cell: int) -> void:
	_colony_layer.set_hover(cell)
	_building_layer.set_hover(cell)
	_hud.set_tooltip_cell(cell)


func _on_palette_changed(palette: Palette) -> void:
	_forest_view.apply_palette(palette)
	_hud.theme = Settings.ui_theme
	_colony_layer.refresh()
	_building_layer.refresh()


func _on_placing_changed(building: StringName) -> void:
	_hud.set_placing(building)
	_building_layer.set_placing(building)
