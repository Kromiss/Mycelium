extends SceneTree
## Outil de développement : ouvre un écran du jeu et enregistre une capture PNG.
## Utilisation (avec un affichage, réel ou virtuel) :
##   godot --path . -s tools/capture.gd -- <écran> <thème> <fichier.png> [mode] [secondes]
## <écran> : menu, settings, sandbox (réglages ; sandbox-bottom : bas de l'écran),
## game (partie de Bac à sable), game-robots (contre un robot par secteur libre), game-watch
## (partie de robots regardée, sans joueur), game-menu (partie avec le menu Échap ouvert),
## game-end (partie terminée après [secondes]), game-mutation (cartes de mutation à l'écran),
## simulations (panneau de simulations ; [mode] « launch » : onglet Lancement, « results » :
## un petit lot joué, onglet Résultats) ;
## <thème> : light ou dark ; [mode] : duel ou ffa (pour sandbox-bottom : défilement en pixels) ;
## [secondes] : durée de jeu simulée avant la capture (la colonie achète l'amélioration la
## moins chère et prend la première mutation proposée).

const SCREENS: Dictionary[String, String] = {
	"menu": "res://ui/menus/main_menu.tscn",
	"settings": "res://ui/settings/settings_screen.tscn",
	"sandbox": "res://ui/sandbox/sandbox_setup.tscn",
	"sandbox-bottom": "res://ui/sandbox/sandbox_setup.tscn",
	"game": "res://game/sandbox_screen.tscn",
	"game-menu": "res://game/sandbox_screen.tscn",
	"game-end": "res://game/sandbox_screen.tscn",
	"game-mutation": "res://game/sandbox_screen.tscn",
	"game-robots": "res://game/sandbox_screen.tscn",
	"game-watch": "res://game/sandbox_screen.tscn",
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
		if args[0] == "game-robots" or args[0] == "game-watch":
			var profiles: Array[RobotProfile] = RobotCatalog.profiles()
			var first: int = 0 if args[0] == "game-watch" else 1
			for sector: int in range(first, config.profiles.size()):
				config.profiles[sector] = profiles[sector % profiles.size()].id
			config.spectator = args[0] == "game-watch"
		root.get_node("SceneRouter").set("sandbox_config", config)
	var error: Error = change_scene_to_file(SCREENS[args[0]])
	if error != OK:
		quit(1)
		return
	await process_frame
	if args.size() > 4 and args[0].begins_with("game"):
		_play(args[4].to_int(), args[0] != "game-mutation")
	if args[0] == "simulations" and args.size() > 3 and args[3] == "results":
		var runs: SpinBox = current_scene.get("_runs_spin")
		var minutes: SpinBox = current_scene.get("_minutes_spin")
		runs.value = 2
		minutes.value = 3
		current_scene.call("start", false)
	if args[0] == "simulations" and args.size() > 3 and args[3] == "launch":
		var tabs: TabContainer = current_scene.get("_tabs")
		tabs.current_tab = 1
	if args[0] == "sandbox-bottom":
		await process_frame
		var scroll: ScrollContainer = current_scene.get_node("Scroll")
		scroll.scroll_vertical = 100_000 if args.size() < 4 else args[3].to_int()
	if args[0] == "game-menu":
		current_scene.get_node("%Hud").call("open_game_menu")
	for _frame: int in range(FRAMES_BEFORE_CAPTURE):
		await process_frame
	var image: Image = root.get_texture().get_image()
	error = image.save_png(args[2])
	print("Capture enregistrée : %s (%s)" % [args[2], error_string(error)])
	quit(0 if error == OK else 1)


## Joue « seconds » secondes de partie : à chaque seconde, la colonie achète l'amélioration
## la moins chère qu'elle peut payer et, si « choose », prend la première mutation proposée.
func _play(seconds: int, choose: bool) -> void:
	var session: Session = current_scene.get_node("%Session")
	for _second: int in range(seconds):
		if session.is_spectator():
			session.step()
			continue
		var state: GameState = session.simulation.state
		var colony: ColonyState = session.colony()
		if choose and not colony.pending_offers.is_empty():
			session.send_command(ChooseMutationCommand.new(0))
		var best: int = -1
		var best_cost: int = 0
		for index: int in range(state.defs.upgrades.size()):
			var id: StringName = state.defs.upgrades[index].id
			if session.simulation.check(BuyUpgradeCommand.new(id, 1, colony.id)) != Refusal.Code.OK:
				continue
			var cost: int = session.simulation.upgrade_cost(colony.id, id)
			if best < 0 or cost < best_cost:
				best = index
				best_cost = cost
		if best >= 0:
			session.send_command(BuyUpgradeCommand.new(state.defs.upgrades[best].id))
		session.step()
