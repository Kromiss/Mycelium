extends GutTest
## Tests des paramètres du joueur (valeurs de départ, enregistrement, relecture).

const PATH: String = "user://test_settings.cfg"


func after_each() -> void:
	if FileAccess.file_exists(PATH):
		var error: Error = DirAccess.remove_absolute(PATH)
		assert_eq(error, OK)


func test_first_launch_follows_system_language() -> void:
	assert_eq(SettingsStore.defaults("fr").locale, "fr")
	assert_eq(SettingsStore.defaults("en").locale, "en")
	assert_eq(SettingsStore.defaults("de").locale, "en")


func test_first_launch_window_is_maximized() -> void:
	var store: SettingsStore = SettingsStore.defaults("fr")
	assert_eq(store.window_mode, SettingsStore.WindowMode.MAXIMIZED)


func test_missing_file_gives_defaults() -> void:
	var store: SettingsStore = SettingsStore.load_from("user://does_not_exist.cfg", "fr")
	assert_eq(store.locale, "fr")


func test_round_trip() -> void:
	var store: SettingsStore = SettingsStore.defaults("en")
	store.theme_mode = SettingsStore.ThemeMode.DARK
	store.locale = "fr"
	store.window_mode = SettingsStore.WindowMode.WINDOWED
	store.resolution = Vector2i(1600, 900)
	assert_eq(store.save_to(PATH), OK)
	var loaded: SettingsStore = SettingsStore.load_from(PATH, "en")
	assert_eq(loaded.theme_mode, SettingsStore.ThemeMode.DARK)
	assert_eq(loaded.locale, "fr")
	assert_eq(loaded.window_mode, SettingsStore.WindowMode.WINDOWED)
	assert_eq(loaded.resolution, Vector2i(1600, 900))


func test_invalid_values_are_ignored() -> void:
	var file := ConfigFile.new()
	file.set_value(SettingsStore.SECTION, "theme_mode", 42)
	file.set_value(SettingsStore.SECTION, "locale", "xx")
	file.set_value(SettingsStore.SECTION, "resolution", Vector2i(123, 45))
	assert_eq(file.save(PATH), OK)
	var loaded: SettingsStore = SettingsStore.load_from(PATH, "fr")
	var defaults: SettingsStore = SettingsStore.defaults("fr")
	assert_eq(loaded.theme_mode, defaults.theme_mode)
	assert_eq(loaded.locale, "fr")
	assert_eq(loaded.resolution, defaults.resolution)


func test_controls_have_defaults_and_round_trip() -> void:
	var store: SettingsStore = SettingsStore.defaults("fr")
	assert_eq(store.controls[&"toggle_pause"], KEY_P)
	assert_eq(store.controls[&"queue_modifier"], KEY_SHIFT)
	assert_true(store.set_control(&"toggle_pause", KEY_O))
	assert_eq(store.save_to(PATH), OK)
	var loaded: SettingsStore = SettingsStore.load_from(PATH, "fr")
	assert_eq(loaded.controls[&"toggle_pause"], KEY_O)
	assert_eq(loaded.controls[&"recenter_camera"], KEY_SPACE)


func test_a_key_cannot_serve_two_actions() -> void:
	var store: SettingsStore = SettingsStore.defaults("fr")
	assert_false(store.set_control(&"toggle_pause", KEY_SPACE))
	assert_eq(store.controls[&"toggle_pause"], KEY_P)
	assert_false(store.set_control(&"unknown_action", KEY_K))
	assert_eq(store.action_for_key(KEY_ESCAPE), &"back_to_menu")
	assert_true(store.set_control(&"toggle_pause", KEY_K))
	store.reset_controls()
	assert_eq(store.controls[&"toggle_pause"], KEY_P)


func test_swapped_keys_are_loaded_and_duplicates_rejected() -> void:
	var file := ConfigFile.new()
	file.set_value(SettingsStore.CONTROLS_SECTION, "toggle_pause", KEY_SPACE)
	file.set_value(SettingsStore.CONTROLS_SECTION, "recenter_camera", KEY_P)
	assert_eq(file.save(PATH), OK)
	var loaded: SettingsStore = SettingsStore.load_from(PATH, "fr")
	assert_eq(loaded.controls[&"toggle_pause"], KEY_SPACE)
	assert_eq(loaded.controls[&"recenter_camera"], KEY_P)
	file.set_value(SettingsStore.CONTROLS_SECTION, "back_to_menu", KEY_P)
	assert_eq(file.save(PATH), OK)
	loaded = SettingsStore.load_from(PATH, "fr")
	assert_eq(loaded.controls, SettingsStore.CONTROLS)
