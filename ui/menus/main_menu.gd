extends Control
## Menu principal (GDD §2.1). Au G0, seuls Duel, FFA, Paramètres et Quitter mènent quelque part ;
## les autres entrées sont visibles mais grisées, avec la mention « bientôt ».

@onready var _duel_button: Button = %DuelButton
@onready var _ffa_button: Button = %FfaButton
@onready var _settings_button: Button = %SettingsButton
@onready var _quit_button: Button = %QuitButton
@onready var _version_label: Label = %VersionLabel


func _ready() -> void:
	_duel_button.pressed.connect(SceneRouter.goto_forest.bind(&"duel"))
	_ffa_button.pressed.connect(SceneRouter.goto_forest.bind(&"ffa"))
	_settings_button.pressed.connect(SceneRouter.goto_settings)
	_quit_button.pressed.connect(SceneRouter.quit)
	_update_version()
	_duel_button.grab_focus()


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready():
		_update_version()


func _update_version() -> void:
	var version: String = ProjectSettings.get_setting("application/config/version", "")
	_version_label.text = tr("MENU_VERSION") % version
