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

var theme_mode: ThemeMode = ThemeMode.SYSTEM
var locale: String = "en"
var window_mode: WindowMode = WindowMode.MAXIMIZED
var resolution: Vector2i = RESOLUTIONS[0]


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
	return store


## Enregistre les paramètres. Renvoie le code d'erreur de Godot (OK si tout va bien).
func save_to(path: String) -> Error:
	var file := ConfigFile.new()
	file.set_value(SECTION, "theme_mode", theme_mode)
	file.set_value(SECTION, "locale", locale)
	file.set_value(SECTION, "window_mode", window_mode)
	file.set_value(SECTION, "resolution", resolution)
	return file.save(path)
