extends Node2D
## Écran de la carte (G0) : génère la forêt du mode choisi et l'affiche avec la caméra.
## Échap ramène au menu principal.

const ZONES: ZoneTable = preload("res://data/zones.tres")

@onready var _forest_view: ForestView = %ForestView
@onready var _camera: MapCamera = %MapCamera
@onready var _mode_label: Label = %ModeLabel
@onready var _hud: Control = %HudColumn


func _ready() -> void:
	var mode: ModeDef = SceneRouter.current_mode
	var map: ForestMap = MapGenerator.generate(mode, ZONES.count())
	_forest_view.setup(map, Settings.palette())
	_camera.frame(_forest_view.bounds())
	_mode_label.text = mode.name_key
	# Les contrôles d'un CanvasLayer n'héritent pas du thème de la fenêtre.
	_hud.theme = Settings.ui_theme
	Settings.palette_changed.connect(_on_palette_changed)


func _on_palette_changed(palette: Palette) -> void:
	_forest_view.apply_palette(palette)
	_hud.theme = Settings.ui_theme


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()
