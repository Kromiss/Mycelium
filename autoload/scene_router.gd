extends Node
## Singleton « SceneRouter » : passe d'un écran à l'autre et garde le mode choisi.

const MAIN_MENU: String = "res://ui/menus/main_menu.tscn"
const SETTINGS: String = "res://ui/settings/settings_screen.tscn"
const FOREST: String = "res://game/forest_screen.tscn"
const MODES: Dictionary[StringName, ModeDef] = {
	&"duel": preload("res://data/modes/duel.tres"),
	&"ffa": preload("res://data/modes/ffa.tres"),
}

## Mode de la forêt à afficher.
var current_mode: ModeDef = MODES[&"duel"]


func goto_main_menu() -> void:
	_change(MAIN_MENU)


func goto_settings() -> void:
	_change(SETTINGS)


func goto_forest(mode_id: StringName) -> void:
	current_mode = MODES[mode_id]
	_change(FOREST)


func quit() -> void:
	get_tree().quit()


func _change(path: String) -> void:
	var error: Error = get_tree().change_scene_to_file(path)
	if error != OK:
		push_error("Impossible d'ouvrir l'écran %s (erreur %d)." % [path, error])
