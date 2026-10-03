extends SceneTree
## Outil de développement : ouvre un écran du jeu et enregistre une capture PNG.
## Utilisation (avec un affichage, réel ou virtuel) :
##   godot --path . -s tools/capture.gd -- <écran> <thème> <fichier.png> [mode]
## <écran> : menu, settings ou forest ; <thème> : light ou dark ; [mode] : duel ou ffa.

const SCREENS: Dictionary[String, String] = {
	"menu": "res://ui/menus/main_menu.tscn",
	"settings": "res://ui/settings/settings_screen.tscn",
	"forest": "res://game/forest_screen.tscn",
}
const FRAMES_BEFORE_CAPTURE: int = 10


func _initialize() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	if args.size() < 3:
		push_error("Usage : -- <écran> <thème> <fichier.png> [mode]")
		quit(1)
		return
	# Les singletons sont prêts après la première image.
	await process_frame
	var settings: Node = root.get_node("Settings")
	var theme_mode: int = SettingsStore.ThemeMode.DARK
	if args[1] == "light":
		theme_mode = SettingsStore.ThemeMode.LIGHT
	settings.call("set_theme_mode", theme_mode)
	if args.size() > 3:
		root.get_node("SceneRouter").set("current_mode", load("res://data/modes/%s.tres" % args[3]))
	var error: Error = change_scene_to_file(SCREENS[args[0]])
	if error != OK:
		quit(1)
		return
	for _frame: int in range(FRAMES_BEFORE_CAPTURE):
		await process_frame
	var image: Image = root.get_texture().get_image()
	error = image.save_png(args[2])
	print("Capture enregistrée : %s (%s)" % [args[2], error_string(error)])
	quit(0 if error == OK else 1)
