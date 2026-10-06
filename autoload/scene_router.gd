extends Node
## Singleton « SceneRouter » : passe d'un écran à l'autre et garde ce dont l'écran suivant a
## besoin (réglages de la partie de Bac à sable).

const MAIN_MENU: String = "res://ui/menus/main_menu.tscn"
const SETTINGS: String = "res://ui/settings/settings_screen.tscn"
const PLAY_SETUP: String = "res://ui/play/play_setup.tscn"
const SANDBOX_SETUP: String = "res://ui/sandbox/sandbox_setup.tscn"
const GAME_SCREEN: String = "res://game/game_screen.tscn"
## Panneau de simulations : outil de développement, absent des exports (dossier tools/). Le
## routeur ne connaît que le chemin de sa scène.
const SIMULATION_PANEL: String = "res://tools/simulation_panel/simulation_panel.tscn"
const MODES: Dictionary[StringName, ModeDef] = {
	&"duel": preload("res://data/modes/duel.tres"),
	&"ffa": preload("res://data/modes/ffa.tres"),
}

## Réglages de la partie de Bac à sable à lancer (ou en cours).
var game_config: GameConfig
## Mode choisi au menu pour une partie contre les robots (« duel » ou « ffa ») et rang de la
## dernière difficulté choisie (Normal au départ), gardés pendant la session.
var play_mode: StringName = &"duel"
var play_difficulty: int = 1
## État du panneau de simulations, gardé quand on part regarder une partie. Non typé : les
## classes du panneau (tools/) n'existent pas dans les exports.
var simulation_panel_state: Variant = null


func goto_main_menu() -> void:
	_change(MAIN_MENU)


func goto_settings() -> void:
	_change(SETTINGS)


## Écran de lancement d'une partie contre les robots (« duel » ou « ffa »).
func goto_play_setup(mode_id: StringName) -> void:
	play_mode = mode_id
	_change(PLAY_SETUP)


## Écran de réglages du Bac à sable, toujours avec les valeurs par défaut (GDD §2.1 bis).
func goto_sandbox_setup() -> void:
	game_config = null
	_change(SANDBOX_SETUP)


## Lance une partie de Bac à sable avec ces réglages.
func start_game(config: GameConfig) -> void:
	game_config = config
	_change(GAME_SCREEN)


## Quitte la partie : retour au panneau de simulations pour une partie regardée depuis le
## panneau, sinon au menu principal.
func leave_game() -> void:
	if game_config != null and game_config.spectator and has_simulation_panel():
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
