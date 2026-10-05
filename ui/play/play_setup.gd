extends Control
## Lancement d'une partie contre les robots (GDD §2.2, §2.3 ; G4, décidé le 5 octobre 2026) :
## le mode vient du menu principal (Duel ou FFA), le joueur choisit la difficulté des robots
## (une pour tous), puis lance. La graine est tirée au hasard.

## Rang de la difficulté proposée au premier affichage (Normal).
const DEFAULT_DIFFICULTY: int = 1

var _mode: ModeDef
var _buttons: Array[Button] = []
var _selected: int = DEFAULT_DIFFICULTY

@onready var _title: Label = %Title
@onready var _intro: Label = %Intro
@onready var _difficulties: HBoxContainer = %Difficulties
@onready var _hint: Label = %DifficultyHint
@onready var _back_button: Button = %BackButton
@onready var _launch_button: Button = %LaunchButton


func _ready() -> void:
	_mode = SceneRouter.MODES.get(SceneRouter.play_mode, SceneRouter.MODES[&"duel"])
	var key: String = "PLAY_%s" % String(_mode.id).to_upper()
	_title.text = key + "_TITLE"
	_intro.text = key + "_INTRO"
	var group := ButtonGroup.new()
	var list: Array[RobotDifficulty] = RobotCatalog.difficulties()
	_selected = clampi(SceneRouter.play_difficulty, 0, list.size() - 1)
	for index: int in range(list.size()):
		var button := Button.new()
		button.text = list[index].name_key
		button.toggle_mode = true
		button.button_group = group
		button.custom_minimum_size = Vector2(200.0, 0.0)
		button.button_pressed = index == _selected
		button.pressed.connect(select.bind(index))
		_difficulties.add_child(button)
		_buttons.append(button)
	_back_button.pressed.connect(SceneRouter.goto_main_menu)
	_launch_button.pressed.connect(launch)
	_update_hint()
	_launch_button.grab_focus()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("back_to_menu"):
		SceneRouter.goto_main_menu()


## Choisit une difficulté (rang dans RobotCatalog.difficulties()).
func select(index: int) -> void:
	_selected = index
	_buttons[index].button_pressed = true
	SceneRouter.play_difficulty = index
	_update_hint()


## Difficulté choisie.
func difficulty() -> RobotDifficulty:
	return RobotCatalog.difficulties()[_selected]


## Lance la partie, avec une graine tirée au hasard (aléatoire de l'interface).
func launch() -> void:
	var game_seed: int = randi() % 1_000_000_000
	SceneRouter.start_game(GameConfig.versus(_mode, game_seed, difficulty().id))


func _update_hint() -> void:
	_hint.text = "PLAY_%s_HINT" % String(difficulty().id).to_upper()
