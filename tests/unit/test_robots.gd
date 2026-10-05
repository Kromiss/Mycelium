extends GutTest
## Robots (GDD §2.5, Architecture §6) : achats d'améliorations, mutations, priorité de tir,
## cible, pas de la Tourelle et capacités. Les robots ne font que proposer des commandes, que
## la simulation accepte comme celles d'un joueur.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _upgrade(id: StringName) -> int:
	return _sim.state.defs.upgrade_index(id)


## Profil vide (rien n'est acheté, aucune capacité), à compléter par chaque test.
func _profile() -> RobotProfile:
	var profile := RobotProfile.new()
	profile.id = &"test"
	profile.step_min_owned_neighbors = 0
	profile.step_pause_ticks = 0
	return profile


func _commands_of(commands: Array[Command], type: Command.Type) -> Array[Command]:
	var found: Array[Command] = []
	for command: Command in commands:
		if command.type == type:
			found.append(command)
	return found


## Donne à la colonie 0 une case voisine de la Tourelle adverse et y place sa Tourelle :
## la Tourelle adverse est alors à portée et collée au territoire. Renvoie la case.
func _turret_next_to_enemy() -> int:
	var state: GameState = _sim.state
	var enemy: int = _colony(1).turret
	var spot: int = -1
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(enemy, direction)
		if other >= 0 and state.owner[other] == -1:
			spot = other
			break
	Fixture.give(_sim, 0, [state.map.cells[spot]])
	_colony().turret = spot
	state.tick = state.defs.protection_ticks
	return spot


# --- Améliorations ---


func test_planner_buys_as_many_levels_as_the_stock_pays() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"damage": 1}
	var damage: int = _upgrade(&"damage")
	_colony().nutrients = 10 * _sim.upgrade_cost(0, &"damage")
	var expected: int = Upgrades.preview(_sim.state, _colony(), damage, 0)[0]
	assert_gt(expected, 1)
	var plan: Dictionary[int, int] = UpgradePlanner.plan(_sim.state, _colony(), profile)
	assert_eq(plan, {damage: expected})


func test_planner_saves_for_the_best_upgrade() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"damage": 1, &"rate": 100}
	# Assez pour Dégâts, pas pour Cadence : le robot attend de pouvoir payer Cadence.
	_colony().nutrients = _sim.upgrade_cost(0, &"damage")
	assert_lt(_colony().nutrients, _sim.upgrade_cost(0, &"rate"))
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {})
	_colony().nutrients = _sim.upgrade_cost(0, &"rate")
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {_upgrade(&"rate"): 1})


func test_planner_skips_locked_maxed_and_unweighted_upgrades() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"rate": 1, &"range": 1}
	_sim.state.defs.upgrades[_upgrade(&"rate")].unlock_tier = 3
	_colony().upgrade_levels[_upgrade(&"range")] = (
		_sim.state.defs.upgrades[_upgrade(&"range")].max_level
	)
	_colony().nutrients = 1_000_000_000
	assert_eq(UpgradePlanner.plan(_sim.state, _colony(), profile), {})


func test_robot_purchases_are_accepted_by_the_simulation() -> void:
	var profile: RobotProfile = _profile()
	profile.upgrade_weights = {&"damage": 3, &"yield": 2, &"regen": 1}
	_colony().nutrients = 50 * _sim.upgrade_cost(0, &"damage")
	var robot := Robot.new(profile, 0, 1)
	var result: TickResult = _sim.tick(robot.decide(_sim))
	assert_eq(result.refused.size(), 0)
	assert_gt(_colony().upgrade_levels[_upgrade(&"damage")], 0)
	assert_gt(_colony().upgrade_levels[_upgrade(&"yield")], 0)
	assert_lt(_colony().nutrients, _sim.upgrade_cost(0, &"regen") * 4)


# --- Mutations et priorité ---


func test_robot_takes_the_heaviest_mutation() -> void:
	var defs: SimDefs = _sim.state.defs
	var profile: RobotProfile = _profile()
	profile.mutation_weights = {&"healer": 1, &"predator": 9, &"miser": 4}
	_colony().pending_offers = PackedInt32Array(
		[
			defs.mutation_index(&"healer"),
			defs.mutation_index(&"predator"),
			defs.mutation_index(&"miser")
		]
	)
	_colony().pending_tiers = PackedInt32Array([1])
	var robot := Robot.new(profile, 0, 1)
	_sim.tick(robot.decide(_sim))
	assert_eq(_colony().mutations, PackedInt32Array([defs.mutation_index(&"predator")]))
	assert_true(_colony().pending_offers.is_empty())


func test_robot_defends_while_attacked_then_comes_back() -> void:
	var profile: RobotProfile = _profile()
	profile.priority = ColonyState.Priority.RICHEST
	profile.defense_priority = ColonyState.Priority.HEAL_FIRST
	profile.defense_hold_ticks = 5
	var robot := Robot.new(profile, 0, 1)
	_sim.tick(robot.decide(_sim))
	assert_eq(_colony().priority, ColonyState.Priority.RICHEST)
	_colony(1).designated = Fixture.cell(_sim, Fixture.INNER_0)
	_sim.tick(robot.decide(_sim))
	assert_eq(_colony().priority, ColonyState.Priority.HEAL_FIRST)
	_colony(1).designated = -1
	for i: int in range(3):
		_sim.tick(robot.decide(_sim))
	assert_eq(_colony().priority, ColonyState.Priority.HEAL_FIRST)
	for i: int in range(3):
		_sim.tick(robot.decide(_sim))
	assert_eq(_colony().priority, ColonyState.Priority.RICHEST)


func test_attacked_cells_list_my_cells_aimed_by_enemies() -> void:
	_colony(1).targets = PackedInt32Array([Fixture.cell(_sim, Fixture.EDGE_0), 0])
	_colony(1).designated = _colony().turret
	var cells: PackedInt32Array = Threats.attacked_cells(_sim.state, _colony())
	assert_eq(cells, PackedInt32Array([_colony().turret, Fixture.cell(_sim, Fixture.EDGE_0)]))


# --- Cible et pas ---


func test_hunter_designates_the_enemy_turret_when_it_can() -> void:
	var profile: RobotProfile = _profile()
	profile.hunts_turrets = true
	var robot := Robot.new(profile, 0, 1)
	assert_true(_commands_of(robot.decide(_sim), Command.Type.TARGET).is_empty())
	_turret_next_to_enemy()
	var targets: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.TARGET)
	assert_eq(targets.size(), 1)
	var enemy: Vector2i = _sim.state.map.cells[_colony(1).turret]
	assert_eq((targets[0] as TargetCommand).cell, enemy)
	profile.hunts_turrets = false
	assert_true(_commands_of(robot.decide(_sim), Command.Type.TARGET).is_empty())


func test_conqueror_steps_toward_the_center_behind_its_territory() -> void:
	var profile: RobotProfile = _profile()
	profile.moves_turret = true
	profile.step_min_owned_neighbors = 3
	var robot := Robot.new(profile, 0, 1)
	# La case vers le centre n'a pas assez de voisines à la colonie.
	assert_true(_commands_of(robot.decide(_sim), Command.Type.MOVE_TURRET).is_empty())
	Fixture.give(_sim, 0, _behind_inner())
	var moves: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.MOVE_TURRET)
	assert_eq(moves.size(), 1)
	assert_eq((moves[0] as MoveTurretCommand).cell, Fixture.INNER_0)
	_sim.tick(moves)
	assert_true(_colony().is_moving())
	assert_true(_commands_of(robot.decide(_sim), Command.Type.MOVE_TURRET).is_empty())


func test_only_moving_profiles_step() -> void:
	var profile: RobotProfile = _profile()
	Fixture.give(_sim, 0, _behind_inner())
	var robot := Robot.new(profile, 0, 1)
	assert_true(_commands_of(robot.decide(_sim), Command.Type.MOVE_TURRET).is_empty())
	assert_true(RobotCatalog.CONQUEROR.moves_turret)
	assert_false(RobotCatalog.GUNNER.moves_turret)
	assert_false(RobotCatalog.BUILDER.moves_turret)


## Ligne vers le centre et deux cases en dessous : la case vers le centre a 3 voisines à moi.
func _behind_inner() -> Array[Vector2i]:
	var cells: Array[Vector2i] = Fixture.line_to_center(3)
	cells.append_array([Vector2i(10, 1), Vector2i(9, 1)])
	return cells


# --- Capacités ---


func _ready_for_abilities() -> RobotProfile:
	_sim.state.tick = _sim.state.defs.protection_ticks
	_colony().tier = 6
	_colony().cell_count = 160
	_colony().tier_ticks.fill(0)
	_colony().enzymes = 1_000_000
	var profile: RobotProfile = _profile()
	profile.abilities = [&"salvo", &"wall", &"cloud"]
	return profile


func test_salvo_only_while_the_turret_has_targets() -> void:
	var robot := Robot.new(_ready_for_abilities(), 0, 1)
	_colony().targets = PackedInt32Array()
	assert_true(_commands_of(robot.decide(_sim), Command.Type.USE_ABILITY).is_empty())
	_colony().targets = PackedInt32Array([Fixture.cell(_sim, Vector2i(10, -1))])
	var uses: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.USE_ABILITY)
	assert_eq(uses.size(), 1)
	assert_eq((uses[0] as UseAbilityCommand).ability, &"salvo")


func test_wall_goes_on_the_attacked_cell_and_cloud_on_the_enemy() -> void:
	var profile: RobotProfile = _ready_for_abilities()
	profile.abilities = [&"wall", &"cloud"]
	var robot := Robot.new(profile, 0, 1)
	assert_true(_commands_of(robot.decide(_sim), Command.Type.USE_ABILITY).is_empty())
	var spot: int = _turret_next_to_enemy()
	_colony(1).designated = spot
	var uses: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.USE_ABILITY)
	assert_eq(uses.size(), 2)
	var wall := uses[0] as UseAbilityCommand
	var cloud := uses[1] as UseAbilityCommand
	assert_eq(wall.ability, &"wall")
	assert_eq(wall.cell, _sim.state.map.cells[spot])
	assert_eq(cloud.ability, &"cloud")
	var cloud_cell: int = _sim.cell_index(cloud.cell)
	assert_eq(_sim.state.owner[cloud_cell], 1)
	assert_lte(_sim.state.distance(cloud_cell, _colony(1).turret), 1)
	var result: TickResult = _sim.tick(uses)
	assert_eq(result.refused.size(), 0)


func test_abilities_share_the_enzymes() -> void:
	var profile: RobotProfile = _ready_for_abilities()
	profile.abilities = [&"wall", &"cloud"]
	var robot := Robot.new(profile, 0, 1)
	var spot: int = _turret_next_to_enemy()
	_colony(1).designated = spot
	var wall_cost: int = Fixed.from_units(_sim.state.defs.abilities[1].cost_enzymes)
	_colony().enzymes = wall_cost
	var uses: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.USE_ABILITY)
	assert_eq(uses.size(), 1)


# --- Profils ---


func test_profiles_follow_the_gdd() -> void:
	var ids: Array[StringName] = []
	for profile: RobotProfile in RobotCatalog.profiles():
		ids.append(profile.id)
		for id: StringName in profile.upgrade_weights:
			assert_gte(_sim.state.defs.upgrade_index(id), 0, "%s : %s" % [profile.id, id])
		for id: StringName in profile.mutation_weights:
			assert_gte(_sim.state.defs.mutation_index(id), 0, "%s : %s" % [profile.id, id])
		for id: StringName in profile.abilities:
			assert_gte(_sim.state.defs.ability_index(id), 0, "%s : %s" % [profile.id, id])
	assert_eq(ids, [&"gunner", &"builder", &"conqueror"] as Array[StringName])
	assert_eq(RobotCatalog.find(&"builder"), RobotCatalog.BUILDER)
	assert_null(RobotCatalog.find(&""))
	# Canonnier : dégâts et cadence d'abord ; Bâtisseur : rendement et défense ; Conquérant :
	# portée et ennemis.
	assert_eq(_heaviest(RobotCatalog.GUNNER), [&"damage", &"rate"] as Array[StringName])
	assert_eq(_heaviest(RobotCatalog.BUILDER), [&"yield"] as Array[StringName])
	assert_eq(_heaviest(RobotCatalog.CONQUEROR), [&"range"] as Array[StringName])
	assert_eq(RobotCatalog.CONQUEROR.priority, ColonyState.Priority.ENEMIES_FIRST)


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


func test_easy_robot_never_hunts_walls_or_clouds() -> void:
	var easy: Robot = RobotCatalog.make(&"game_easy", 0, 1)
	var hard: Robot = RobotCatalog.make(&"game_hard", 0, 1)
	_ready_for_abilities()
	var spot: int = _turret_next_to_enemy()
	_colony(1).designated = spot
	_colony().targets = PackedInt32Array([_colony(1).turret])
	var hard_commands: Array[Command] = hard.decide(_sim)
	assert_eq(_commands_of(hard_commands, Command.Type.TARGET).size(), 1)
	assert_eq(_commands_of(hard_commands, Command.Type.USE_ABILITY).size(), 3)
	assert_true(easy.acts_at(_sim.state.tick))
	var easy_commands: Array[Command] = easy.decide(_sim)
	assert_true(_commands_of(easy_commands, Command.Type.TARGET).is_empty())
	var uses: Array[Command] = _commands_of(easy_commands, Command.Type.USE_ABILITY)
	assert_eq(uses.size(), 1)
	assert_eq((uses[0] as UseAbilityCommand).ability, &"salvo")


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
	profile.upgrade_weights = {&"damage": 1}
	_colony().nutrients = 40 * _sim.upgrade_cost(0, &"damage")
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
	assert_true(RobotCatalog.GAME_ROBOT.moves_turret)
	assert_eq(RobotCatalog.HARD.act_every_ticks, 1)
	assert_eq(RobotCatalog.NORMAL.act_every_ticks, 2)
	assert_eq(RobotCatalog.EASY.act_every_ticks, 3)
	TranslationServer.set_locale(locale)
