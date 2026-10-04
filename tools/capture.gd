extends SceneTree
## Outil de développement : ouvre un écran du jeu et enregistre une capture PNG.
## Utilisation (avec un affichage, réel ou virtuel) :
##   godot --path . -s tools/capture.gd -- <écran> <thème> <fichier.png> [mode]
## <écran> : menu, settings, sandbox (réglages), game (partie de Bac à sable), game-menu
## (partie avec le menu Échap ouvert), game-end (partie terminée après [secondes]) ou
## simulations (panneau ; [minutes] : lance un petit lot et montre les résultats) ;
## <thème> : light ou dark ; [mode] : duel ou ffa (forêt de la partie) ;
## [secondes] : durée de jeu simulée avant la capture, pour « game » (colonisation automatique).

const SCREENS: Dictionary[String, String] = {
	"menu": "res://ui/menus/main_menu.tscn",
	"settings": "res://ui/settings/settings_screen.tscn",
	"sandbox": "res://ui/sandbox/sandbox_setup.tscn",
	"game": "res://game/sandbox_screen.tscn",
	"game-menu": "res://game/sandbox_screen.tscn",
	"game-end": "res://game/sandbox_screen.tscn",
	"simulations": "res://tools/simulation_panel/simulation_panel.tscn",
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
	if args.size() > 3 and args[0].begins_with("game"):
		var mode: ModeDef = load("res://data/modes/%s.tres" % args[3])
		var config: SandboxConfig = SandboxConfig.defaults(mode, 1)
		if args[0] == "game-end" and args.size() > 4:
			config.defs.match_ticks = args[4].to_int()
		root.get_node("SceneRouter").set("sandbox_config", config)
	var error: Error = change_scene_to_file(SCREENS[args[0]])
	if error != OK:
		quit(1)
		return
	await process_frame
	if args.size() > 4 and args[0].begins_with("game"):
		_play(args[4].to_int())
	if args[0] == "simulations" and args.size() > 3:
		await _simulate(args[3].to_int())
	if args[0] == "game-menu":
		current_scene.get_node("%Hud").call("open_game_menu")
	for _frame: int in range(FRAMES_BEFORE_CAPTURE):
		await process_frame
	var image: Image = root.get_texture().get_image()
	error = image.save_png(args[2])
	print("Capture enregistrée : %s (%s)" % [args[2], error_string(error)])
	quit(0 if error == OK else 1)


## Joue « seconds » secondes de partie en remplissant la file avec les cases les moins chères,
## au plus près du Cœur.
func _play(seconds: int) -> void:
	var session: Session = current_scene.get_node("%Session")
	for _second: int in range(seconds):
		var state: GameState = session.simulation.state
		var colony: ColonyState = session.colony()
		if colony.queue_load() < state.defs.expansion_queue_size:
			var best: int = -1
			for cell: int in range(state.cell_count()):
				if Expansion.check_enqueue(state, colony, cell) != Refusal.Code.OK:
					continue
				if best < 0 or _better(state, colony, cell, best):
					best = cell
			if best >= 0:
				session.send_command(EnqueueCommand.new(state.map.cells[best]))
		session.step()


## Vrai si « cell » est un meilleur choix que « best » : moins chère, puis plus près du Cœur.
func _better(state: GameState, colony: ColonyState, cell: int, best: int) -> bool:
	var cost: int = Expansion.cost(state, colony, cell)
	var best_cost: int = Expansion.cost(state, colony, best)
	if cost != best_cost:
		return cost < best_cost
	var heart: Vector2i = state.map.cells[colony.heart]
	return Hex.distance(state.map.cells[cell], heart) < Hex.distance(state.map.cells[best], heart)


## Lance un petit lot de simulations dans le panneau et attend les résultats.
func _simulate(minutes: int) -> void:
	var panel: Node = current_scene
	var runs: SpinBox = panel.get("_runs_spin")
	var duration: SpinBox = panel.get("_minutes_spin")
	var start: Button = panel.get("_start_button")
	runs.value = 3
	duration.value = minutes
	panel.call("_on_start")
	while start.disabled:
		await process_frame
