extends Node2D
## Écran d'une partie de Bac à sable (GDD §2.1 bis) : le joueur seul sur une forêt de Duel ou
## de FFA, avec la couleur Menthe. Relie la session, la carte, la colonie, les gestes, la
## caméra et le HUD ; P met en pause, Espace recentre sur le Cœur, Échap ouvre le menu.

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
@onready var _camera: MapCamera = %MapCamera
@onready var _input: MapInput = %MapInput
@onready var _hud: Hud = %Hud


func _ready() -> void:
	_config = SceneRouter.sandbox_config
	if _config == null:
		_config = SandboxConfig.defaults(SceneRouter.MODES[&"duel"], 1)
	_session.start_local(_config.defs.duplicate_defs(), _config.game_seed, 1, true)
	var map: ForestMap = _session.simulation.state.map
	_forest_view.setup(map, Settings.palette())
	var color: int = COLORS.index_of(PLAYER_COLOR)
	_colony_layer.setup(_forest_view, _session, COLORS.main[color], COLORS.dark[color])
	_camera.frame(_forest_view.bounds())
	_input.setup(_session, _forest_view)
	_hud.theme = Settings.ui_theme
	_hud.setup(_session, _config, COLORS.main[color])
	_session.ticked.connect(_on_ticked)
	_input.hovered.connect(_on_hovered)
	_input.message.connect(_hud.show_message)
	Settings.palette_changed.connect(_on_palette_changed)
	recenter()


## Ramène la caméra sur le Cœur de la colonie.
func recenter() -> void:
	var heart: Vector2 = _forest_view.cell_center(_session.colony().heart)
	var center: Vector2 = _forest_view.bounds().get_center()
	_camera.focus(heart.lerp(center, HEART_FOCUS_TOWARD_CENTER), HEART_ZOOM_FACTOR)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		if _hud.is_game_menu_open():
			_hud.close_game_menu()
		else:
			_hud.open_game_menu()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("toggle_pause") and not _hud.is_game_menu_open():
		_session.set_paused(not _session.paused)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("recenter_camera"):
		recenter()
		get_viewport().set_input_as_handled()


func _on_ticked(result: TickResult) -> void:
	_colony_layer.refresh()
	for i: int in range(0, result.tier_changes.size(), 3):
		var raised: bool = result.tier_changes[i + 2] > result.tier_changes[i + 1]
		if result.tier_changes[i] == _session.local_colony and raised:
			_colony_layer.jump_heart()


func _on_hovered(cell: int) -> void:
	_colony_layer.set_hover(cell)
	_hud.set_tooltip_cell(cell)


func _on_palette_changed(palette: Palette) -> void:
	_forest_view.apply_palette(palette)
	_hud.theme = Settings.ui_theme
	_colony_layer.refresh()
