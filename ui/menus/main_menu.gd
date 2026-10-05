extends Control
## Menu principal (GDD §2.1). En G1, Bac à sable, Paramètres et Quitter mènent quelque part ;
## les autres entrées (Duel et FFA jusqu'aux robots en G4) sont grisées, avec « bientôt ».

@onready var _sandbox_button: Button = %SandboxButton
@onready var _simulations_button: Button = %SimulationsButton
@onready var _settings_button: Button = %SettingsButton
@onready var _quit_button: Button = %QuitButton
@onready var _version_label: Label = %VersionLabel


func _ready() -> void:
	_sandbox_button.pressed.connect(SceneRouter.goto_sandbox_setup)
	# Panneau de simulations : seulement quand le jeu est lancé depuis l'éditeur (GDD §18.5).
	_simulations_button.visible = SceneRouter.has_simulation_panel()
	_simulations_button.pressed.connect(SceneRouter.goto_simulation_panel)
	_settings_button.pressed.connect(SceneRouter.goto_settings)
	_quit_button.pressed.connect(SceneRouter.quit)
	_update_version()
	_sandbox_button.grab_focus()


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready():
		_update_version()


func _update_version() -> void:
	var version: String = ProjectSettings.get_setting("application/config/version", "")
	_version_label.text = tr("MENU_VERSION") % version
