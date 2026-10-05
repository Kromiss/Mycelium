extends Node2D
## Écran d'une partie locale (maquettes G3) : la carte à gauche, le panneau à droite.
## - Bac à sable (GDD §2.1 bis) : le joueur en Menthe sur le premier secteur, seul ou contre des
##   robots (un par secteur), avec pause et vitesse ;
## - contre les robots (Duel et FFA, G4) : secteur et couleurs tirés de la graine, robots de
##   jeu sur tous les autres secteurs, ni pause ni vitesse ; éliminé, le joueur a fini ;
## - spectateur : une partie de robots du panneau de simulations, sans joueur.
## Relie la session, les robots, la carte, les colonies, les gestes, la caméra et le HUD.
## Touches : P pause (Bac à sable), Espace recentre sur la Tourelle, D puis clic fait faire un
## pas, Q W E lancent les capacités, 1 à 3 choisissent une mutation quand les cartes sont
## affichées, Échap annule le geste en cours ou ouvre le menu de partie.

## Actions des capacités et des cartes de mutation, dans l'ordre.
const ABILITY_ACTIONS: Array[StringName] = [&"ability_1", &"ability_2", &"ability_3"]
const MUTATION_ACTIONS: Array[StringName] = [&"mutation_1", &"mutation_2", &"mutation_3"]
## Zoom utilisé pour recentrer sur la Tourelle, en multiple du zoom qui montre toute la forêt.
const TURRET_ZOOM_FACTOR: float = 1.6
## La Tourelle part du bord de la forêt : on vise un peu vers le centre pour voir où avancer.
const TURRET_FOCUS_TOWARD_CENTER: float = 0.3

var _config: GameConfig

@onready var _session: Session = %Session
@onready var _forest_view: ForestView = %ForestView
@onready var _colony_layer: ColonyLayer = %ColonyLayer
@onready var _camera: MapCamera = %MapCamera
@onready var _input: MapInput = %MapInput
@onready var _hud: Hud = %Hud


func _ready() -> void:
	_config = SceneRouter.game_config
	if _config == null:
		_config = GameConfig.defaults(SceneRouter.MODES[&"duel"], 1)
	var sectors: PackedInt32Array = _config.colony_sectors()
	# Pause et vitesse : seulement en Bac à sable (GDD §2.6).
	var time_control: bool = not _config.is_versus()
	_session.start_local(
		_config.defs.duplicate_defs(), _config.game_seed, sectors.size(), time_control, sectors
	)
	_session.local_colony = _config.player_colony()
	_session.colors = _config.colors
	var profiles: Array[StringName] = _config.colony_profiles()
	for colony_id: int in range(profiles.size()):
		var robot: Robot = RobotCatalog.make(profiles[colony_id], colony_id, _config.game_seed)
		if robot != null:
			_session.add_robot(robot)
	if _config.spectator:
		_session.set_spectator()
	var map: ForestMap = _session.simulation.state.map
	_forest_view.setup(map, Settings.palette())
	var main: Array[Color] = []
	var dark: Array[Color] = []
	for colony: ColonyState in _session.simulation.state.colonies:
		var color: int = GameText.color_index(colony.id, _config.colors)
		main.append(GameText.COLORS.main[color])
		dark.append(GameText.COLORS.dark[color])
	_colony_layer.setup(_forest_view, _session, main, dark)
	_input.setup(_session, _forest_view)
	_hud.theme = Settings.ui_theme
	_hud.setup(_session, _config, main, dark)
	_camera.view_rect = _hud.map_rect()
	_camera.frame(_forest_view.bounds())
	_session.ticked.connect(_on_ticked)
	_session.game_finished.connect(func() -> void: _input.cancel())
	_input.hovered.connect(_on_hovered)
	_input.message.connect(_hud.show_message)
	_input.mode_changed.connect(_hud.set_input_mode)
	_hud.ability_requested.connect(_input.use_ability)
	get_viewport().size_changed.connect(_on_viewport_resized)
	Settings.palette_changed.connect(_on_palette_changed)
	recenter()
	if not _config.title.is_empty():
		_hud.show_message(_config.title)


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
		elif not _input.cancel():
			_hud.open_game_menu()
		get_viewport().set_input_as_handled()
		return
	if _hud.is_game_menu_open():
		return
	if _shortcut(event):
		get_viewport().set_input_as_handled()


## Raccourcis de la partie. Vrai si la touche a servi.
func _shortcut(event: InputEvent) -> bool:
	if event.is_action_pressed("toggle_pause"):
		_session.set_paused(not _session.paused)
		return true
	if event.is_action_pressed("recenter_camera"):
		recenter()
		return true
	if _hud.is_offer_visible():
		for choice: int in range(MUTATION_ACTIONS.size()):
			if event.is_action_pressed(MUTATION_ACTIONS[choice]):
				_hud.choose_mutation(choice)
				return true
	for index: int in range(ABILITY_ACTIONS.size()):
		if event.is_action_pressed(ABILITY_ACTIONS[index]):
			_input.use_ability(index)
			return true
	return false


func _on_ticked(result: TickResult) -> void:
	_colony_layer.refresh(result)
	# Contre les robots, le joueur éliminé termine sa partie tout de suite, avec son rang
	# (décidé le 5 octobre 2026).
	if _config.is_versus() and _session.is_running() and not _session.colony().alive:
		_session.stop()


func _on_hovered(cell: int) -> void:
	_colony_layer.set_hover(cell)
	_hud.set_tooltip_cell(cell)


func _on_viewport_resized() -> void:
	_camera.view_rect = _hud.map_rect()


func _on_palette_changed(palette: Palette) -> void:
	_forest_view.apply_palette(palette)
	_hud.theme = Settings.ui_theme
	_colony_layer.refresh()
