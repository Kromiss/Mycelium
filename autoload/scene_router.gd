extends Node
## Singleton « SceneRouter » : passe d'un écran à l'autre et garde ce dont l'écran suivant a
## besoin (réglages de la partie de Bac à sable).

const MAIN_MENU: String = "res://ui/menus/main_menu.tscn"
const SETTINGS: String = "res://ui/settings/settings_screen.tscn"
const SANDBOX_SETUP: String = "res://ui/sandbox/sandbox_setup.tscn"
const SANDBOX_GAME: String = "res://game/sandbox_screen.tscn"
## Panneau de simulations : outil de développement, absent des exports (dossier tools/). Le
## routeur ne connaît que le chemin de sa scène.
const SIMULATION_PANEL: String = "res://tools/simulation_panel/simulation_panel.tscn"
const MODES: Dictionary[StringName, ModeDef] = {
	&"duel": preload("res://data/modes/duel.tres"),
	&"ffa": preload("res://data/modes/ffa.tres"),
}

## Réglages de la partie de Bac à sable à lancer (ou en cours).
var sandbox_config: SandboxConfig
## État du panneau de simulations, gardé quand on part regarder une partie. Non typé : les
## classes du panneau (tools/) n'existent pas dans les exports.
var simulation_panel_state: Variant = null


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


## Quitte la partie : retour au panneau de simulations pour une partie regardée depuis le
## panneau, sinon au menu principal.
func leave_game() -> void:
	if sandbox_config != null and sandbox_config.spectator and has_simulation_panel():
		goto_simulation_panel()
	else:
		goto_main_menu()


## Vrai si le panneau de simulations est disponible (jeu lancé depuis l'éditeur).
func has_simulation_panel() -> bool:
	return OS.has_feature("editor") and ResourceLoader.exists(SIMULATION_PANEL)


## Ouvre le panneau de simulations (éditeur seulement).
func goto_simulation_panel() -> void:
	if has_simulation_panel():
		_change(SIMULATION_PANEL)


func quit() -> void:
	get_tree().quit()


func _change(path: String) -> void:
	var error: Error = get_tree().change_scene_to_file(path)
	if error != OK:
		push_error("Impossible d'ouvrir l'écran %s (erreur %d)." % [path, error])
