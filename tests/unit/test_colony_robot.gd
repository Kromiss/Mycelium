extends GutTest
## Robots du panneau de simulations en G2 (GDD §14.5) : bourses d'expansion et de construction,
## profils de bâtisseur (Producteur, Accélérateur, Hasardeux) et choix des cases.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
## Cases de la colonie 0 en Duel (rayon 11).
const INNER := Vector2i(10, 0)
const EDGE := Vector2i(11, -1)
const AROUND: Array[Vector2i] = [
	Vector2i(10, -1), Vector2i(10, 1), Vector2i(9, 0), Vector2i(9, 1), Vector2i(11, -2)
]

var _sim: Simulation


func before_each() -> void:
	_sim = Simulation.new(SimDefs.from_mode(DUEL), 5, 1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _index(cell: Vector2i) -> int:
	return _sim.cell_index(cell)


func _robot(builder: BuilderRobot.Profile, share: int) -> ColonyRobot:
	var spec := RobotSpec.make(EconomyRobot.Profile.PROFITABLE, builder, share)
	return ColonyRobot.new(spec, 0, 5)


func _builder(profile: BuilderRobot.Profile) -> BuilderRobot:
	return BuilderRobot.new(profile, SimRng.new(5))


## Donne à la colonie des cases poussées, puis recalcule réseau, palier et bâtiments actifs.
func _own(cells: Array[Vector2i]) -> void:
	for cell: Vector2i in cells:
		var index: int = _index(cell)
		_sim.state.owner[index] = 0
		_sim.state.cell_state[index] = GameState.CellState.OWNED
		_colony().cell_count += 1
	_sim.state.recompute_network()
	_colony().tier = TierSystem.tier_for(_sim.state.defs, _colony().cell_count)
	Buildings.refresh_activity(_sim.state)


func _set_building(cell: Vector2i, id: StringName) -> void:
	var index: int = _index(cell)
	_sim.state.building[index] = _sim.state.defs.building_index(id)
	_sim.state.building_state[index] = GameState.BuildState.BUILT
	Buildings.refresh_activity(_sim.state)


func test_start_stock_goes_to_expansion_then_income_is_shared() -> void:
	var robot: ColonyRobot = _robot(BuilderRobot.Profile.NONE, 70)
	var commands: Array[Command] = robot.decide(_sim)
	assert_eq(commands.size(), 1)
	# Le stock de départ (180) est à l'expansion ; la case choisie (30) est débitée à l'ajout.
	var cost: int = Expansion.cost(_sim.state, _colony(), _index((commands[0] as CellCommand).cell))
	assert_eq(robot.expansion_purse, 180_000 - cost)
	assert_eq(robot.build_purse, 0)
	var expansion: int = robot.expansion_purse
	_sim.tick(commands)
	var gained: int = _colony().production
	robot.decide(_sim)
	# La case est partie en pousse (payée) : seul le gain du tick est partagé, 70 / 30.
	assert_eq(robot.build_purse, gained - gained * 70 / 100)
	assert_lte(robot.expansion_purse, expansion + gained * 70 / 100)


func test_a_cell_enters_the_queue_only_if_the_expansion_purse_pays_it() -> void:
	var robot: ColonyRobot = _robot(BuilderRobot.Profile.NONE, 100)
	_colony().nutrients = 10_000
	assert_eq(robot.decide(_sim).size(), 0)
	assert_gt(robot.last_candidate_count, 0)


func test_robot_stops_when_the_queue_is_full() -> void:
	var robot: ColonyRobot = _robot(BuilderRobot.Profile.NONE, 100)
	_colony().nutrients = 5_000_000
	for i: int in range(6):
		_sim.tick(robot.decide(_sim))
	assert_eq(_colony().queue_load(), 5)
	assert_eq(robot.decide(_sim).size(), 0)


func test_purses_shrink_together_when_the_stock_cap_cuts_production() -> void:
	var robot: ColonyRobot = _robot(BuilderRobot.Profile.NONE, 50)
	robot.decide(_sim)
	robot.expansion_purse = 100_000
	robot.build_purse = 100_000
	# La colonie n'a plus que 100 de libre (hors réservations) : chaque bourse garde la moitié.
	_colony().nutrients = 100_000
	_colony().queue.clear()
	robot.decide(_sim)
	assert_eq(robot.build_purse, 50_000)


func test_producer_builds_nodes_then_a_gland_for_three_nodes_and_a_granary_when_full() -> void:
	var builder: BuilderRobot = _builder(BuilderRobot.Profile.PRODUCER)
	var node: int = _sim.state.defs.building_index(&"digestion_node")
	var gland: int = _sim.state.defs.building_index(&"enzyme_gland")
	var granary: int = _sim.state.defs.building_index(&"granary")
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), node)
	var more: Array[Vector2i] = [Vector2i(9, 2), Vector2i(8, 1), Vector2i(8, 2), Vector2i(8, 0)]
	_own(AROUND + more)
	assert_eq(_colony().tier, 2)
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), node)
	for cell: Vector2i in [INNER, EDGE, AROUND[0]]:
		_set_building(cell, &"digestion_node")
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), gland)
	_colony().stock_cap = 1_000_000
	_colony().nutrients = 800_000
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), granary)


func test_accelerator_wants_nurseries_then_mycorrhizas_then_nodes() -> void:
	var builder: BuilderRobot = _builder(BuilderRobot.Profile.ACCELERATOR)
	var defs: SimDefs = _sim.state.defs
	_own(AROUND)
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), defs.building_index(&"nursery"))
	_set_building(INNER, &"nursery")
	_set_building(EDGE, &"nursery")
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), defs.building_index(&"digestion_node"))
	_colony().tier = 3
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), defs.building_index(&"mycorrhiza"))


func test_random_builder_only_draws_types_it_can_pay() -> void:
	var builder: BuilderRobot = _builder(BuilderRobot.Profile.RANDOM)
	assert_eq(builder.wanted_type(_sim.state, _colony(), 0), -1)
	_own(AROUND)
	var drawn: Dictionary[int, bool] = {}
	for i: int in range(30):
		drawn[builder.wanted_type(_sim.state, _colony(), 10_000_000)] = true
	# Palier 1 : Nœud, Grenier et Pépinière.
	assert_eq(drawn.size(), 3)
	var again: BuilderRobot = _builder(BuilderRobot.Profile.RANDOM)
	var other: BuilderRobot = _builder(BuilderRobot.Profile.RANDOM)
	for i: int in range(10):
		assert_eq(
			again.wanted_type(_sim.state, _colony(), 10_000_000),
			other.wanted_type(_sim.state, _colony(), 10_000_000)
		)


func test_node_goes_where_it_adds_the_most_production() -> void:
	_own(AROUND)
	var node: int = _sim.state.defs.building_index(&"digestion_node")
	var alone: float = BuilderRobot.node_gain(_sim.state, _colony(), _index(EDGE), node)
	_set_building(INNER, &"digestion_node")
	var next_to: float = BuilderRobot.node_gain(_sim.state, _colony(), _index(EDGE), node)
	assert_gt(next_to, alone)
	var builder: BuilderRobot = _builder(BuilderRobot.Profile.PRODUCER)
	var best: int = builder.best_cell(_sim.state, _colony(), node)
	for cell: int in range(_sim.state.cell_count()):
		if cell == _colony().heart or _sim.state.building[cell] >= 0:
			continue
		if _sim.state.is_owned_by(cell, 0):
			assert_lte(
				BuilderRobot.node_gain(_sim.state, _colony(), cell, node),
				BuilderRobot.node_gain(_sim.state, _colony(), best, node) + 0.0001
			)


func test_nursery_covers_the_most_free_cells_and_granary_takes_the_least_useful_cell() -> void:
	_own(AROUND)
	var defs: SimDefs = _sim.state.defs
	var nursery: int = defs.building_index(&"nursery")
	var node: int = defs.building_index(&"digestion_node")
	var builder: BuilderRobot = _builder(BuilderRobot.Profile.ACCELERATOR)
	var best: int = builder.best_cell(_sim.state, _colony(), nursery)
	var granary_cell: int = builder.best_cell(
		_sim.state, _colony(), defs.building_index(&"granary")
	)
	for cell: int in range(_sim.state.cell_count()):
		if cell == _colony().heart or not _sim.state.is_owned_by(cell, 0):
			continue
		assert_lte(
			BuilderRobot.coverage(_sim.state, _colony(), cell, nursery),
			BuilderRobot.coverage(_sim.state, _colony(), best, nursery)
		)
		assert_gte(
			BuilderRobot.node_gain(_sim.state, _colony(), cell, node) + 0.0001,
			BuilderRobot.node_gain(_sim.state, _colony(), granary_cell, node)
		)
	# Une Pépinière posée : les cases qu'elle couvre ne comptent plus.
	var before: int = BuilderRobot.coverage(_sim.state, _colony(), best, nursery)
	_set_building(_sim.state.map.cells[best], &"nursery")
	assert_lt(BuilderRobot.coverage(_sim.state, _colony(), best, nursery), before)


func test_a_producer_robot_builds_during_a_game() -> void:
	var robot: ColonyRobot = _robot(BuilderRobot.Profile.PRODUCER, 70)
	for i: int in range(240):
		_sim.tick(robot.decide(_sim))
		assert_gte(robot.build_purse, 0)
		assert_gte(robot.expansion_purse, 0)
	var node: int = _sim.state.defs.building_index(&"digestion_node")
	assert_gt(Buildings.count_of(_sim.state, _colony(), node), 0)


func test_spec_label_and_round_trip() -> void:
	var locale: String = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	var spec := RobotSpec.make(EconomyRobot.Profile.FAST, BuilderRobot.Profile.ACCELERATOR, 60)
	assert_eq(spec.label(), "Fast · Accelerator · 60 %")
	assert_eq(
		RobotSpec.make(EconomyRobot.Profile.CENTER, BuilderRobot.Profile.NONE, 100).label(),
		"Centre"
	)
	assert_eq(RobotSpec.from_dict(spec.to_dict()).to_dict(), spec.to_dict())
	assert_eq(RobotSpec.from_dict({"expansion": 99, "expansion_share": 250}).expansion_share, 100)
	assert_eq(RobotSpec.default_list().size(), 7)
	TranslationServer.set_locale(locale)
