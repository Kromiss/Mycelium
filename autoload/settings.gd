extends Node
## Singleton « Settings » : charge les paramètres du joueur, les applique (thème, langue,
## fenêtre) et les enregistre à chaque changement.

## Émis quand le thème affiché change (choix du joueur ou thème du système).
signal palette_changed(palette: Palette)

const SAVE_PATH: String = "user://settings.cfg"
const LIGHT_PALETTE: Palette = preload("res://data/palettes/light.tres")
const DARK_PALETTE: Palette = preload("res://data/palettes/dark.tres")

var store: SettingsStore
## Thème de l'interface pour la palette affichée. Appliqué à la fenêtre ; les écrans qui
## placent des contrôles dans un CanvasLayer doivent aussi l'appliquer à ces contrôles.
var ui_theme: Theme
var _dark: bool = false


func _ready() -> void:
	store = SettingsStore.load_from(SAVE_PATH, OS.get_locale_language())
	_apply_locale()
	_apply_window()
	_refresh_theme(true)


func _notification(what: int) -> void:
	# Le thème du système peut changer pendant que le jeu tourne.
	if what == NOTIFICATION_APPLICATION_FOCUS_IN and store != null:
		_refresh_theme(false)


## Palette du thème actuellement affiché.
func palette() -> Palette:
	return DARK_PALETTE if _dark else LIGHT_PALETTE


func set_theme_mode(mode: SettingsStore.ThemeMode) -> void:
	store.theme_mode = mode
	_save()
	_refresh_theme(false)


func set_locale(locale: String) -> void:
	store.locale = locale
	_save()
	_apply_locale()


func set_window_mode(mode: SettingsStore.WindowMode) -> void:
	store.window_mode = mode
	_save()
	_apply_window()


func set_resolution(resolution: Vector2i) -> void:
	store.resolution = resolution
	_save()
	_apply_window()


## Tailles de fenêtre proposées qui tiennent sur l'écran actuel.
func available_resolutions() -> Array[Vector2i]:
	var screen: Vector2i = DisplayServer.screen_get_size()
	var result: Array[Vector2i] = []
	for resolution: Vector2i in SettingsStore.RESOLUTIONS:
		if resolution.x <= screen.x and resolution.y <= screen.y:
			result.append(resolution)
	if result.is_empty():
		result.append(SettingsStore.RESOLUTIONS[0])
	return result


func _save() -> void:
	var error: Error = store.save_to(SAVE_PATH)
	if error != OK:
		push_warning("Impossible d'enregistrer les paramètres (erreur %d)." % error)


func _apply_locale() -> void:
	TranslationServer.set_locale(store.locale)


func _apply_window() -> void:
	if DisplayServer.get_name() == "headless":
		return
	match store.window_mode:
		SettingsStore.WindowMode.FULLSCREEN:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
		SettingsStore.WindowMode.WINDOWED:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
			DisplayServer.window_set_size(store.resolution)
			_center_window()
		_:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_MAXIMIZED)


func _center_window() -> void:
	var screen: int = DisplayServer.window_get_current_screen()
	var screen_rect: Rect2i = DisplayServer.screen_get_usable_rect(screen)
	var size: Vector2i = DisplayServer.window_get_size()
	DisplayServer.window_set_position(screen_rect.position + (screen_rect.size - size) / 2)


## Recalcule le thème affiché et prévient l'interface s'il a changé.
func _refresh_theme(force: bool) -> void:
	var dark: bool
	match store.theme_mode:
		SettingsStore.ThemeMode.DARK:
			dark = true
		SettingsStore.ThemeMode.LIGHT:
			dark = false
		_:
			dark = DisplayServer.is_dark_mode_supported() and DisplayServer.is_dark_mode()
	if dark == _dark and not force:
		return
	_dark = dark
	var current: Palette = palette()
	RenderingServer.set_default_clear_color(current.background)
	ui_theme = ThemeFactory.build(current)
	get_tree().root.theme = ui_theme
	palette_changed.emit(current)
