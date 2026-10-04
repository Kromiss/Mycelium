extends Node
## Singleton « SceneRouter » : passe d'un écran à l'autre et garde ce dont l'écran suivant a
## besoin (réglages de la partie de Bac à sable).

const MAIN_MENU: String = "res://ui/menus/main_menu.tscn"
const SETTINGS: String = "res://ui/settings/settings_screen.tscn"
const SANDBOX_SETUP: String = "res://ui/sandbox/sandbox_setup.tscn"
const SANDBOX_GAME: String = "res://game/sandbox_screen.tscn"
const MODES: Dictionary[StringName, ModeDef] = {
	&"duel": preload("res://data/modes/duel.tres"),
	&"ffa": preload("res://data/modes/ffa.tres"),
}

## Réglages de la partie de Bac à sable à lancer (ou en cours).
var sandbox_config: SandboxConfig


func goto_main_menu() -> void:
	_change(MAIN_MENU)


func goto_settings() -> void:
	_change(SETTINGS)


## Écran de réglages du Bac à sable, toujours avec les valeurs par défaut (GDD §2.1 bis).
func goto_sandbox_setup() -> void:
	sandbox_config = null
	_change(SANDBOX_SETUP)


## Lance une partie de Bac à sable avec ces réglages.
func start_sandbox(config: SandboxConfig) -> void:
	sandbox_config = config
	_change(SANDBOX_GAME)


func quit() -> void:
	get_tree().quit()


func _change(path: String) -> void:
	var error: Error = get_tree().change_scene_to_file(path)
	if error != OK:
		push_error("Impossible d'ouvrir l'écran %s (erreur %d)." % [path, error])
