extends GutTest
## Robots et bâtiments (GDD §5 bis) : pose sur le front, Enzymes gardées pour le prochain
## bâtiment, démolition d'un bâtiment inutile.

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


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


## Profil qui ne pose que des Essaimeurs ; la colonie 0 au palier 1 avec de quoi en payer un.
func _swarmer_robot() -> Robot:
	var profile: RobotProfile = _profile()
	profile.building_weights = {&"swarmer": 1}
	_colony().tier = 1
	_colony().enzymes = Fixed.from_units(10)
	return Robot.new(profile, 0, 1)


func test_robot_builds_on_the_front() -> void:
	var robot: Robot = _swarmer_robot()
	var builds: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.BUILD)
	assert_eq(builds.size(), 1)
	var build := builds[0] as BuildCommand
	assert_eq(build.building, &"swarmer")
	var cell: int = _sim.cell_index(build.cell)
	assert_eq(_sim.state.owner[cell], 0)
	assert_ne(cell, _colony().turret)
	assert_eq(_sim.check(build), Refusal.Code.OK)


func test_robot_keeps_its_enzymes_for_the_next_building() -> void:
	var robot: Robot = _swarmer_robot()
	robot.profile.abilities = [&"salvo"]
	_sim.state.tick = _sim.state.defs.protection_ticks
	# Rien à payer : la Salve (20) doit attendre le bâtiment (10).
	_colony().enzymes = Fixed.from_units(25)
	var commands: Array[Command] = robot.decide(_sim)
	assert_eq(_commands_of(commands, Command.Type.BUILD).size(), 1)
	assert_eq(_commands_of(commands, Command.Type.USE_ABILITY).size(), 0)


func test_robot_demolishes_an_idle_building_to_build_further() -> void:
	var robot: Robot = _swarmer_robot()
	# Un Essaimeur sans aucune case libre à portée : entouré de cases de la colonie.
	var center := Vector2i(6, 0)
	var cells: Array[Vector2i] = [center]
	for offset: Vector2i in Hex.cells_in_radius(3):
		cells.append(center + offset)
	Fixture.give(_sim, 0, cells)
	Buildings.build(_sim.state, _colony(), 0, _sim.cell_index(center), TickResult.new())
	_sim.state.building_on(_sim.cell_index(center)).ready_tick = 0
	_colony().enzymes = Fixed.from_units(10)
	var demolitions: Array[Command] = _commands_of(robot.decide(_sim), Command.Type.DEMOLISH)
	assert_eq(demolitions.size(), 1)
	assert_eq((demolitions[0] as DemolishCommand).cell, center)
