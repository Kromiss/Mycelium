extends GutTest
## Robots (GDD §2.5, Architecture §6) : achats d'améliorations, mutations et points chauds. Les
## robots ne font que proposer des commandes, que la simulation accepte comme celles d'un
## joueur.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _upgrade(id: StringName) -> int:
	return _sim.state.defs.upgrade_index(id)


## Profil vide (rien n'est acheté, aucun point chaud), à compléter par chaque test.
func _profile() -> RobotProfile:
	var profile := RobotProfile.new()
	profile.id = &"test"
	return profile


func _commands_of(commands: Array[Command], type: Command.Type) -> Array[Command]:
	var found: Array[Command] = []
	for command: Command in commands:
		if command.type == type:
			found.append(command)
	return found


# --- Améliorations ---


func test_planner_buys_as_many_levels_as_the_stock_pays() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"push": 1}
	var push: int = _upgrade(&"push")
	_colony().nutrients = 10 * _sim.upgrade_cost(0, &"push")
	var expected: int = Upgrades.preview(_sim.state, _colony(), push, 0)[0]
	assert_gt(expected, 1)
	var plan: Dictionary[int, int] = UpgradePlanner.plan(_sim.state, _colony(), profile)
	assert_eq(plan, {push: expected})


func test_planner_saves_for_the_best_upgrade() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"push": 1, &"vigor": 100}
	# Assez pour Poussée, pas pour Vigueur : le robot attend de pouvoir payer Vigueur.
	_colony().nutrients = _sim.upgrade_cost(0, &"push")
	assert_lt(_colony().nutrients, _sim.upgrade_cost(0, &"vigor"))
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {})
	_colony().nutrients = _sim.upgrade_cost(0, &"vigor")
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {_upgrade(&"vigor"): 1})


func test_planner_skips_locked_maxed_and_unweighted_upgrades() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"vigor": 1, &"regen": 1}
	_sim.state.defs.upgrades[_upgrade(&"vigor")].unlock_tier = 3
	_colony().tier = 1
	_colony().upgrade_levels[_upgrade(&"regen")] = (
		_sim.state.defs.upgrades[_upgrade(&"regen")].max_level
	)
	_colony().nutrients = 1_000_000_000
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {})


func test_robot_purchases_are_accepted_by_the_simulation() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"push": 3, &"yield": 2, &"regen": 1}
	_colony().nutrients = 50 * _sim.upgrade_cost(0, &"push")
	var robot := Robot.new(profile, 0, 1)
	var result: TickResult = _sim.tick(robot.decide(_sim))
	assert_eq(result.refused.size(), 0)
	assert_gt(_colony().upgrade_levels[_upgrade(&"push")], 0)
	assert_gt(_colony().upgrade_levels[_upgrade(&"yield")], 0)
	assert_lt(_colony().nutrients, _sim.upgrade_cost(0, &"regen") * 4)


# --- Mutations ---


func test_robot_takes_the_heaviest_mutation() -> void:
	var defs: SimDefs = _sim.state.defs
	var profile: RobotProfile = _profile()
	profile.mutation_weights = {&"tenacious": 1, &"armored": 9, &"miser": 4}
	_colony().pending_offers = PackedInt32Array(
		[
			defs.mutation_index(&"tenacious"),
			defs.mutation_index(&"armored"),
			defs.mutation_index(&"miser")
		]
	)
	_colony().pending_tiers = PackedInt32Array([1])
	var robot := Robot.new(profile, 0, 1)
	_sim.tick(robot.decide(_sim))
	assert_eq(_colony().mutations, PackedInt32Array([defs.mutation_index(&"armored")]))
	assert_true(_colony().pending_offers.is_empty())


# --- Points chauds ---


func _hotspot_cells(commands: Array[Command]) -> PackedInt32Array:
	var cells := PackedInt32Array()
	for command: Command in _commands_of(commands, Command.Type.HOTSPOT):
		cells.append(_sim.cell_index((command as HotspotCommand).cell))
	return cells


func test_rich_goal_picks_the_most_central_free_cell_near_the_territory() -> void:
	var profile: RobotProfile = _profile()
	var goal: Array[StringName] = [HotspotPlanner.RICH]
	profile.hotspot_goals = goal
	profile.rich_reach = 2
	var cells: PackedInt32Array = _hotspot_cells(Robot.new(profile, 0, 1).decide(_sim))
	assert_eq(cells.size(), 1)
	var state: GameState = _sim.state
	var cell: int = cells[0]
	assert_eq(state.owner[cell], -1)
	assert_eq(state.map.zones[cell], 2)
	assert_lte(state.distance(cell, _colony().turret), 3)


func test_turret_goal_waits_for_the_end_of_the_protection() -> void:
	var profile: RobotProfile = _profile()
	var goal: Array[StringName] = [HotspotPlanner.TURRET]
	profile.hotspot_goals = goal
	var early: PackedInt32Array = _hotspot_cells(Robot.new(profile, 0, 1).decide(_sim))
	assert_ne(early[0], _colony(1).turret)
	_sim.state.tick = _sim.state.defs.protection_ticks
	var late: PackedInt32Array = _hotspot_cells(Robot.new(profile, 0, 1).decide(_sim))
	assert_eq(late, PackedInt32Array([_colony(1).turret]))


func test_center_goal_then_the_closest_enemy() -> void:
	var profile: RobotProfile = _profile()
	var goal: Array[StringName] = [HotspotPlanner.CENTER]
	profile.hotspot_goals = goal
	var center: int = _sim.cell_index(Vector2i.ZERO)
	assert_eq(_hotspot_cells(Robot.new(profile, 0, 1).decide(_sim)), PackedInt32Array([center]))
	_colony().zone_ticks[4] = 100
	var enemy: PackedInt32Array = _hotspot_cells(Robot.new(profile, 0, 1).decide(_sim))
	assert_eq(_sim.state.owner[enemy[0]], 1)


func test_robot_fills_free_slots_with_its_goals_and_keeps_them() -> void:
	var robot: Robot = RobotCatalog.make(&"game_hard", 0, 1)
	Fixture.give(_sim, 0, Fixture.line_to_center(10))
	_sim.state.tick = _sim.state.defs.protection_ticks
	_sim.tick()
	for _i: int in range(3):
		var result: TickResult = _sim.tick(robot.decide(_sim))
		assert_eq(result.refused.size(), 0)
	assert_eq(_colony().hotspots.size(), 3)
	assert_true(_colony().hotspots.has(_colony(1).turret))
	assert_true(_hotspot_cells(robot.decide(_sim)).is_empty())


func test_easy_robot_never_aims_at_the_sporophore() -> void:
	var profile: RobotProfile = _profile()
	var goal: Array[StringName] = [HotspotPlanner.TURRET]
	profile.hotspot_goals = goal
	_sim.state.tick = _sim.state.defs.protection_ticks
	var easy := Robot.new(profile, 0, 1, RobotCatalog.EASY)
	assert_true(easy.acts_at(_sim.state.tick))
	var cells: PackedInt32Array = _hotspot_cells(easy.decide(_sim))
	assert_eq(cells.size(), 1)
	assert_ne(cells[0], _colony(1).turret)


# --- Profils ---


func test_profiles_follow_the_gdd() -> void:
	var ids: Array[StringName] = []
	for profile: RobotProfile in RobotCatalog.profiles():
		ids.append(profile.id)
		for id: StringName in profile.upgrade_weights:
			assert_gte(_sim.state.defs.upgrade_index(id), 0, "%s : %s" % [profile.id, id])
		for id: StringName in profile.mutation_weights:
			assert_gte(_sim.state.defs.mutation_index(id), 0, "%s : %s" % [profile.id, id])
	assert_eq(ids, [&"gunner", &"builder", &"conqueror"] as Array[StringName])
	assert_eq(RobotCatalog.find(&"builder"), RobotCatalog.BUILDER)
	assert_null(RobotCatalog.find(&""))
	# Canonnier : Poussée d'abord ; Bâtisseur : rendement ; Conquérant : Vigueur.
	assert_eq(_heaviest(RobotCatalog.GUNNER), [&"push"] as Array[StringName])
	assert_eq(_heaviest(RobotCatalog.BUILDER), [&"yield"] as Array[StringName])
	assert_eq(_heaviest(RobotCatalog.CONQUEROR), [&"vigor"] as Array[StringName])
	# Points chauds (GDD §2.5, 11 octobre 2026) : Sporophore adverse, cases riches, centre ;
	# robot de jeu, un de chaque.
	assert_eq(RobotCatalog.GUNNER.hotspot_goals, [HotspotPlanner.TURRET] as Array[StringName])
	assert_eq(RobotCatalog.BUILDER.hotspot_goals, [HotspotPlanner.RICH] as Array[StringName])
	assert_eq(RobotCatalog.CONQUEROR.hotspot_goals, [HotspotPlanner.CENTER] as Array[StringName])
	assert_eq(RobotCatalog.GAME_ROBOT.hotspot_goals.size(), 3)


func _heaviest(profile: RobotProfile) -> Array[StringName]:
	var best: int = 0
	for id: StringName in profile.upgrade_weights:
		best = maxi(best, profile.upgrade_weights[id])
	var ids: Array[StringName] = []
	for id: StringName in profile.upgrade_weights:
		if profile.upgrade_weights[id] == best:
			ids.append(id)
	return ids


# --- Robot de jeu et difficultés (G4) ---


func test_difficulties_set_the_pace() -> void:
	var hard: Robot = RobotCatalog.make(&"game_hard", 0, 1)
	var normal: Robot = RobotCatalog.make(&"game_normal", 1, 1)
	var easy: Robot = RobotCatalog.make(&"game_easy", 0, 1)
	for tick: int in range(6):
		assert_true(hard.acts_at(tick))
	assert_eq([normal.acts_at(0), normal.acts_at(1), normal.acts_at(2)], [false, true, false])
	assert_eq([easy.acts_at(0), easy.acts_at(1), easy.acts_at(3)], [true, false, true])
	assert_true(Robot.new(RobotCatalog.GUNNER, 0, 1).acts_at(1))
	# Un robot qui n'agit pas à ce tick n'envoie rien.
	_colony(1).nutrients = 1_000_000
	_sim.state.tick = 2
	assert_true(normal.decide(_sim).is_empty())
	_sim.state.tick = 3
	assert_false(normal.decide(_sim).is_empty())


func test_easy_robot_takes_mutations_at_random() -> void:
	var defs: SimDefs = _sim.state.defs
	var picks: Dictionary[int, bool] = {}
	for game_seed: int in range(12):
		_colony().pending_offers = PackedInt32Array([0, 1, 2])
		_colony().pending_tiers = PackedInt32Array([1])
		var easy: Robot = RobotCatalog.make(&"game_easy", 0, game_seed)
		_sim.state.tick = 0
		for command: Command in _commands_of(easy.decide(_sim), Command.Type.CHOOSE_MUTATION):
			picks[(command as ChooseMutationCommand).choice] = true
	assert_gt(picks.size(), 1)
	assert_eq(defs.mutation_choices, 3)


func test_random_purchases_stay_affordable_and_accepted() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"push": 1}
	_colony().nutrients = 40 * _sim.upgrade_cost(0, &"push")
	var plan: Dictionary[int, int] = UpgradePlanner.plan(
		_sim.state, _colony(), profile, SimRng.new(3), 1
	)
	assert_gt(plan.size(), 1, "achats au hasard sur plusieurs améliorations")
	var commands: Array[Command] = []
	for index: int in plan:
		commands.append(BuyUpgradeCommand.new(_sim.state.defs.upgrades[index].id, plan[index]))
	var result: TickResult = _sim.tick(commands)
	assert_eq(result.refused.size(), 0)


func test_catalog_names_profiles_and_game_robots() -> void:
	var locale: String = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	assert_eq(
		RobotCatalog.sandbox_choices(),
		(
			[&"", &"gunner", &"builder", &"conqueror", &"game_easy", &"game_normal", &"game_hard"]
			as Array[StringName]
		)
	)
	assert_eq(RobotCatalog.label(&"game_normal"), "Game robot · Normal")
	assert_eq(RobotCatalog.label(&"conqueror"), "Conqueror")
	assert_eq(RobotCatalog.label(&"game_nope"), "None")
	assert_null(RobotCatalog.make(&"", 0, 1))
	assert_null(RobotCatalog.make(&"game_nope", 0, 1))
	var robot: Robot = RobotCatalog.make(&"game_easy", 2, 1)
	assert_eq(robot.profile, RobotCatalog.GAME_ROBOT)
	assert_eq(robot.difficulty, RobotCatalog.EASY)
	assert_eq(robot.colony_id, 2)
	assert_eq(RobotCatalog.HARD.act_every_ticks, 1)
	assert_eq(RobotCatalog.NORMAL.act_every_ticks, 2)
	assert_eq(RobotCatalog.EASY.act_every_ticks, 3)
	TranslationServer.set_locale(locale)
