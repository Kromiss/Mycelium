extends SceneTree
## Outil de développement : ouvre un écran du jeu et enregistre une capture PNG.
## Utilisation (avec un affichage, réel ou virtuel) :
##   godot --path . -s tools/capture.gd -- <écran> <thème> <fichier.png> [mode]
## <écran> : menu, settings, sandbox (réglages ; sandbox-bottom : bas de l'écran),
## game (partie de Bac à sable), game-menu
## (partie avec le menu Échap ouvert), game-end (partie terminée après [secondes]),
## game-build (partie où l'on construit aussi), game-radial (menu rond ouvert), game-panel
## (panneau d'un bâtiment ouvert), game-place (mode palette, Pépinière survolée) ou
## simulations (panneau ; [minutes] : lance un petit lot et montre les résultats) ou
## simulations-launch (onglet Lancement du panneau) ;
## <thème> : light ou dark ; [mode] : duel ou ffa (forêt de la partie) ;
## [secondes] : durée de jeu simulée avant la capture, pour « game » (colonisation automatique).

const SCREENS: Dictionary[String, String] = {
	"menu": "res://ui/menus/main_menu.tscn",
	"settings": "res://ui/settings/settings_screen.tscn",
	"sandbox": "res://ui/sandbox/sandbox_setup.tscn",
	"sandbox-bottom": "res://ui/sandbox/sandbox_setup.tscn",
	"game": "res://game/sandbox_screen.tscn",
	"game-menu": "res://game/sandbox_screen.tscn",
	"game-end": "res://game/sandbox_screen.tscn",
	"game-build": "res://game/sandbox_screen.tscn",
	"game-radial": "res://game/sandbox_screen.tscn",
	"game-panel": "res://game/sandbox_screen.tscn",
	"game-place": "res://game/sandbox_screen.tscn",
	"simulations": "res://tools/simulation_panel/simulation_panel.tscn",
	"simulations-launch": "res://tools/simulation_panel/simulation_panel.tscn",
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
		_play(args[4].to_int(), args[0] != "game" and args[0] != "game-end")
	if args[0] in ["game-radial", "game-panel", "game-place"]:
		_open_building_ui(args[0])
	if args[0] == "simulations" and args.size() > 3:
		await _simulate(args[3].to_int())
	if args[0] == "simulations-launch":
		var tabs: TabContainer = current_scene.get("_tabs")
		tabs.current_tab = 1
	if args[0] == "sandbox-bottom":
		await process_frame
		var scroll: ScrollContainer = current_scene.get_node("Scroll")
		scroll.scroll_vertical = 100_000
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
func _play(seconds: int, build: bool) -> void:
	var session: Session = current_scene.get_node("%Session")
	for second: int in range(seconds):
		var state: GameState = session.simulation.state
		var colony: ColonyState = session.colony()
		if build and second % 6 == 5:
			_build_something(session, second)
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


## Pose un bâtiment (types débloqués à tour de rôle) sur la case libre la plus proche du Cœur.
func _build_something(session: Session, second: int) -> void:
	var state: GameState = session.simulation.state
	var colony: ColonyState = session.colony()
	var unlocked: Array[int] = []
	for type: int in range(state.defs.buildings.size()):
		if Buildings.is_unlocked(state, colony, type):
			unlocked.append(type)
	@warning_ignore("integer_division")
	var type: int = unlocked[(second / 6) % unlocked.size()]
	var cell: int = _free_cell(state, colony)
	if cell >= 0 and Buildings.check_build(state, colony, cell, type) == Refusal.Code.OK:
		session.send_command(BuildCommand.new(state.map.cells[cell], state.defs.buildings[type].id))


## Case poussée de la colonie, sans bâtiment, la plus proche du Cœur (−1 : aucune).
func _free_cell(state: GameState, colony: ColonyState) -> int:
	var heart: Vector2i = state.map.cells[colony.heart]
	var best: int = -1
	for cell: int in range(state.cell_count()):
		if cell == colony.heart or not state.is_owned_by(cell, colony.id):
			continue
		if state.building[cell] >= 0:
			continue
		var distance: int = Hex.distance(state.map.cells[cell], heart)
		if best < 0 or distance < Hex.distance(state.map.cells[best], heart):
			best = cell
	return best


## Ouvre le menu rond, le panneau d'un bâtiment ou le mode palette, pour la capture.
func _open_building_ui(screen: String) -> void:
	var session: Session = current_scene.get_node("%Session")
	var state: GameState = session.simulation.state
	var colony: ColonyState = session.colony()
	var hud: Node = current_scene.get_node("%Hud")
	match screen:
		"game-radial":
			hud.call("open_build_menu", _free_cell(state, colony))
		"game-panel":
			for cell: int in range(state.cell_count()):
				if state.building[cell] >= 0 and state.owner[cell] == colony.id:
					hud.call("open_building_panel", cell)
					break
		"game-place":
			var input: Node = current_scene.get_node("%MapInput")
			input.call("set_placing", &"nursery")
			current_scene.call("_on_hovered", _free_cell(state, colony))
