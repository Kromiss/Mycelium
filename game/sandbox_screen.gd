extends Node2D
## Écran d'une partie de Bac à sable (GDD §2.1 bis) : le joueur seul sur une forêt de Duel ou
## de FFA, avec la couleur Menthe. Relie la session, la carte, les colonies, les gestes, la
## caméra et le HUD ; P met en pause, Espace recentre sur la Tourelle, D puis clic fait faire
## un pas à la Tourelle, Échap quitte le mode déplacement ou ouvre le menu de partie.
## Affichage provisoire de G3 (étape 1) : l'écran des maquettes arrive à l'étape 2.

const COLORS: ColonyColors = preload("res://data/colors.tres")
## Couleur du joueur en Bac à sable (GDD §2.1 bis), puis celles des autres colonies.
const COLONY_COLORS: Array[String] = [
	"COLOR_MINT", "COLOR_CORAL", "COLOR_SKY", "COLOR_APRICOT", "COLOR_LAVENDER", "COLOR_CANDY"
]
## Zoom utilisé pour recentrer sur la Tourelle, en multiple du zoom qui montre toute la forêt.
const TURRET_ZOOM_FACTOR: float = 1.6
## La Tourelle part du bord de la forêt : on vise un peu vers le centre pour voir où avancer.
const TURRET_FOCUS_TOWARD_CENTER: float = 0.3

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
	var main: Array[Color] = []
	var dark: Array[Color] = []
	for colony: ColonyState in _session.simulation.state.colonies:
		var color: int = COLORS.index_of(COLONY_COLORS[colony.id % COLONY_COLORS.size()])
		main.append(COLORS.main[color])
		dark.append(COLORS.dark[color])
	_colony_layer.setup(_forest_view, _session, main, dark)
	_camera.frame(_forest_view.bounds())
	_input.setup(_session, _forest_view)
	_hud.theme = Settings.ui_theme
	var local: int = _session.local_colony
	_hud.setup(_session, _config, main[local], dark[local])
	_session.ticked.connect(_on_ticked)
	_session.game_finished.connect(func() -> void: _input.set_moving(false))
	_input.hovered.connect(_on_hovered)
	_input.message.connect(_hud.show_message)
	Settings.palette_changed.connect(_on_palette_changed)
	recenter()


## Ramène la caméra sur la Tourelle de la colonie.
func recenter() -> void:
	var colony: ColonyState = _session.colony()
	var center: Vector2 = _forest_view.bounds().get_center()
	if colony.turret < 0:
		_camera.focus(center, 1.0)
		return
	var turret: Vector2 = _forest_view.cell_center(colony.turret)
	_camera.focus(turret.lerp(center, TURRET_FOCUS_TOWARD_CENTER), TURRET_ZOOM_FACTOR)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		if _hud.is_game_menu_open():
			_hud.close_game_menu()
		elif _input.is_moving():
			_input.set_moving(false)
		else:
			_hud.open_game_menu()
		get_viewport().set_input_as_handled()
		return
	if _hud.is_game_menu_open():
		return
	if event.is_action_pressed("toggle_pause"):
		_session.set_paused(not _session.paused)
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("recenter_camera"):
		recenter()
		get_viewport().set_input_as_handled()


func _on_ticked(result: TickResult) -> void:
	_colony_layer.refresh(result)


func _on_hovered(cell: int) -> void:
	_colony_layer.set_hover(cell)
	_hud.set_tooltip_cell(cell)


func _on_palette_changed(palette: Palette) -> void:
	_forest_view.apply_palette(palette)
	_hud.theme = Settings.ui_theme
	_colony_layer.refresh()
