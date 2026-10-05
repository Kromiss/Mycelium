class_name SettingsStore
extends RefCounted
## Valeurs des paramètres du joueur et leur enregistrement dans un fichier.
## Ne touche ni à la fenêtre ni à l'affichage : c'est le rôle du singleton Settings.

enum ThemeMode { LIGHT, DARK, SYSTEM }
enum WindowMode { MAXIMIZED, WINDOWED, FULLSCREEN }

## Langues proposées.
const LOCALES: Array[String] = ["fr", "en"]
## Tailles de fenêtre proposées en mode fenêtré.
const RESOLUTIONS: Array[Vector2i] = [
	Vector2i(1280, 720),
	Vector2i(1600, 900),
	Vector2i(1920, 1080),
	Vector2i(2560, 1440),
	Vector2i(3840, 2160),
]
const SECTION: String = "settings"
const CONTROLS_SECTION: String = "controls"
## Actions dont la touche est modifiable (GDD §13.5, décidé le 4 octobre 2026), avec leur
## touche par défaut (code physique) et la clé de traduction de leur nom.
const CONTROLS: Dictionary[StringName, int] = {
	&"recenter_camera": KEY_SPACE,
	&"toggle_pause": KEY_P,
	&"back_to_menu": KEY_ESCAPE,
	&"ability_1": KEY_Q,
	&"ability_2": KEY_W,
	&"ability_3": KEY_E,
	&"mutation_1": KEY_1,
	&"mutation_2": KEY_2,
	&"mutation_3": KEY_3,
}
const CONTROL_NAMES: Dictionary[StringName, String] = {
	&"recenter_camera": "ACTION_RECENTER",
	&"toggle_pause": "ACTION_PAUSE",
	&"back_to_menu": "ACTION_MENU",
	&"ability_1": "ACTION_ABILITY_1",
	&"ability_2": "ACTION_ABILITY_2",
	&"ability_3": "ACTION_ABILITY_3",
	&"mutation_1": "ACTION_MUTATION_1",
	&"mutation_2": "ACTION_MUTATION_2",
	&"mutation_3": "ACTION_MUTATION_3",
}

var theme_mode: ThemeMode = ThemeMode.SYSTEM
var locale: String = "en"
var window_mode: WindowMode = WindowMode.MAXIMIZED
var resolution: Vector2i = RESOLUTIONS[0]
## Touche de chaque action modifiable (code physique).
var controls: Dictionary[StringName, int] = CONTROLS.duplicate()


## Valeurs du premier lancement : la langue suit celle du système
## (français si le système est en français, anglais sinon).
static func defaults(system_language: String) -> SettingsStore:
	var store := SettingsStore.new()
	store.locale = "fr" if system_language == "fr" else "en"
	return store


## Lit les paramètres enregistrés. Les valeurs absentes ou invalides gardent
## leur valeur de premier lancement.
static func load_from(path: String, system_language: String) -> SettingsStore:
	var store: SettingsStore = defaults(system_language)
	var file := ConfigFile.new()
	if file.load(path) != OK:
		return store
	var saved_theme: int = file.get_value(SECTION, "theme_mode", store.theme_mode)
	if saved_theme in ThemeMode.values():
		store.theme_mode = saved_theme as ThemeMode
	var saved_locale: String = file.get_value(SECTION, "locale", store.locale)
	if saved_locale in LOCALES:
		store.locale = saved_locale
	var saved_window: int = file.get_value(SECTION, "window_mode", store.window_mode)
	if saved_window in WindowMode.values():
		store.window_mode = saved_window as WindowMode
	var saved_resolution: Vector2i = file.get_value(SECTION, "resolution", store.resolution)
	if saved_resolution in RESOLUTIONS:
		store.resolution = saved_resolution
	store._load_controls(file)
	return store


## Lit les touches enregistrées ; si l'une manque, est invalide ou sert à deux actions, toutes
## les touches restent par défaut.
func _load_controls(file: ConfigFile) -> void:
	var loaded: Dictionary[StringName, int] = {}
	var used: Dictionary[int, bool] = {}
	for action: StringName in CONTROLS:
		var saved_key: Variant = file.get_value(CONTROLS_SECTION, String(action), CONTROLS[action])
		if not saved_key is int:
			return
		var keycode: int = saved_key
		if keycode <= 0 or used.has(keycode):
			return
		used[keycode] = true
		loaded[action] = keycode
	controls = loaded


## Change la touche d'une action. Refusé (faux) si l'action n'est pas modifiable, si la touche
## est invalide ou déjà prise par une autre action.
func set_control(action: StringName, keycode: int) -> bool:
	if not CONTROLS.has(action) or keycode <= 0:
		return false
	var owner: StringName = action_for_key(keycode)
	if owner != &"" and owner != action:
		return false
	controls[action] = keycode
	return true


## Action modifiable liée à une touche (vide si aucune).
func action_for_key(keycode: int) -> StringName:
	for action: StringName in controls:
		if controls[action] == keycode:
			return action
	return &""


## Remet toutes les touches par défaut.
func reset_controls() -> void:
	controls = CONTROLS.duplicate()


## Enregistre les paramètres. Renvoie le code d'erreur de Godot (OK si tout va bien).
func save_to(path: String) -> Error:
	var file := ConfigFile.new()
	file.set_value(SECTION, "theme_mode", theme_mode)
	file.set_value(SECTION, "locale", locale)
	file.set_value(SECTION, "window_mode", window_mode)
	file.set_value(SECTION, "resolution", resolution)
	for action: StringName in controls:
		file.set_value(CONTROLS_SECTION, String(action), controls[action])
	return file.save(path)
