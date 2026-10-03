extends Control
## Écran Paramètres (GDD §13.5). Au G0 : thème, langue et affichage.
## Chaque choix est appliqué et enregistré immédiatement.

## Libellés des listes, dans l'ordre des énumérations de SettingsStore.
const THEME_KEYS: Array[String] = ["THEME_LIGHT", "THEME_DARK", "THEME_SYSTEM"]
const WINDOW_KEYS: Array[String] = ["WINDOW_MAXIMIZED", "WINDOW_WINDOWED", "WINDOW_FULLSCREEN"]
const LOCALE_KEYS: Dictionary[String, String] = {"fr": "LANG_FR", "en": "LANG_EN"}

var _resolutions: Array[Vector2i] = []

@onready var _theme_option: OptionButton = %ThemeOption
@onready var _language_option: OptionButton = %LanguageOption
@onready var _window_option: OptionButton = %WindowOption
@onready var _resolution_option: OptionButton = %ResolutionOption
@onready var _back_button: Button = %BackButton


func _ready() -> void:
	_resolutions = Settings.available_resolutions()
	_fill_options()
	_theme_option.item_selected.connect(_on_theme_selected)
	_language_option.item_selected.connect(_on_language_selected)
	_window_option.item_selected.connect(_on_window_selected)
	_resolution_option.item_selected.connect(_on_resolution_selected)
	_back_button.pressed.connect(SceneRouter.goto_main_menu)
	_back_button.grab_focus()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


func _notification(what: int) -> void:
	# Les libellés des listes sont traduits à la main : on les refait quand la langue change.
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready():
		_fill_options()


## Remplit les listes avec les libellés traduits et la valeur actuelle.
func _fill_options() -> void:
	var store: SettingsStore = Settings.store
	_fill(_theme_option, THEME_KEYS, store.theme_mode)
	_fill(_window_option, WINDOW_KEYS, store.window_mode)
	var locales: Array[String] = []
	for locale: String in SettingsStore.LOCALES:
		locales.append(LOCALE_KEYS[locale])
	_fill(_language_option, locales, SettingsStore.LOCALES.find(store.locale))
	_resolution_option.clear()
	for resolution: Vector2i in _resolutions:
		_resolution_option.add_item("%d × %d" % [resolution.x, resolution.y])
	_resolution_option.select(maxi(0, _resolutions.find(store.resolution)))
	# La taille de la fenêtre ne compte qu'en mode fenêtré.
	_resolution_option.disabled = store.window_mode != SettingsStore.WindowMode.WINDOWED


func _fill(option: OptionButton, keys: Array[String], selected: int) -> void:
	option.clear()
	for key: String in keys:
		option.add_item(tr(key))
	option.select(selected)


func _on_theme_selected(index: int) -> void:
	Settings.set_theme_mode(index as SettingsStore.ThemeMode)


func _on_language_selected(index: int) -> void:
	Settings.set_locale(SettingsStore.LOCALES[index])


func _on_window_selected(index: int) -> void:
	Settings.set_window_mode(index as SettingsStore.WindowMode)
	_resolution_option.disabled = index != SettingsStore.WindowMode.WINDOWED


func _on_resolution_selected(index: int) -> void:
	Settings.set_resolution(_resolutions[index])
