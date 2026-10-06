extends GutTest
## Chaque écran se charge et s'instancie sans erreur.

const SCENES: Array[String] = [
	"res://ui/menus/main_menu.tscn",
	"res://ui/settings/settings_screen.tscn",
	"res://ui/sandbox/sandbox_setup.tscn",
	"res://ui/play/play_setup.tscn",
	"res://game/game_screen.tscn",
	"res://view/map/forest_view.tscn",
]


func test_every_scene_instantiates() -> void:
	for path: String in SCENES:
		var scene: PackedScene = load(path)
		assert_not_null(scene, path)
		var node: Node = scene.instantiate()
		add_child_autofree(node)
		assert_true(node.is_inside_tree(), path)


func test_settings_screen_rebinds_a_key() -> void:
	var scene: PackedScene = load("res://ui/settings/settings_screen.tscn")
	var screen: Node = scene.instantiate()
	add_child_autofree(screen)
	screen.call("_on_control_pressed", &"toggle_pause")
	var event := InputEventKey.new()
	event.physical_keycode = KEY_O
	event.pressed = true
	screen.call("_input", event)
	assert_eq(Settings.store.controls[&"toggle_pause"], KEY_O)
	assert_true(InputMap.action_has_event(&"toggle_pause", event))
	# Une touche déjà prise est refusée.
	screen.call("_on_control_pressed", &"toggle_pause")
	event.physical_keycode = KEY_SPACE
	screen.call("_input", event)
	assert_eq(Settings.store.controls[&"toggle_pause"], KEY_O)
	Settings.reset_controls()
	assert_eq(Settings.store.controls[&"toggle_pause"], KEY_P)
