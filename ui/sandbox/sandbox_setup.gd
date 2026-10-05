extends Control
## Écran de réglages du Bac à sable (GDD §2.1 bis) : forêt, graine et tous les chiffres de
## l'économie, des zones et des paliers. Chaque arrivée sur cet écran repart des valeurs par
## défaut ; « Valeurs par défaut » les remet à tout moment.

@onready var _form: SettingsForm = %SettingsForm
@onready var _error_label: Label = %ErrorLabel
@onready var _back_button: Button = %BackButton
@onready var _defaults_button: Button = %DefaultsButton
@onready var _launch_button: Button = %LaunchButton


func _ready() -> void:
	var existing: GameConfig = SceneRouter.game_config
	var config: GameConfig = (
		existing.duplicate_config() if existing != null else _default_config(&"duel")
	)
	_form.set_config(config)
	_back_button.pressed.connect(SceneRouter.goto_main_menu)
	_defaults_button.pressed.connect(_on_defaults)
	_launch_button.pressed.connect(_on_launch)
	_launch_button.grab_focus()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


## Réglages actuellement affichés (lus par les tests).
func config() -> GameConfig:
	return _form.config()


func _default_config(mode_id: StringName) -> GameConfig:
	return GameConfig.defaults(SceneRouter.MODES[mode_id], SettingsForm.random_seed())


func _on_forest_selected(index: int) -> void:
	_form.call("_on_forest_selected", index)


func _on_defaults() -> void:
	_form.set_config(_default_config(_form.config().mode.id))
	_error_label.text = ""


func _on_launch() -> void:
	var problems: String = _form.problems_text()
	_error_label.text = problems
	if problems.is_empty():
		SceneRouter.start_game(_form.config().duplicate_config())
