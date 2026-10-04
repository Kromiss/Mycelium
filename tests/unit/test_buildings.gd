extends GutTest
## City builder (GDD §7) : pose, file de construction, chantiers, démolition, désactivation et
## effets des bâtiments de G2.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
## Cases de la colonie 0 en Duel (rayon 11).
const HEART := Vector2i(11, 0)
const INNER := Vector2i(10, 0)
const EDGE := Vector2i(11, -1)
const ABOVE := Vector2i(10, -1)
const BELOW := Vector2i(10, 1)
const WEST := Vector2i(9, 0)
const SOUTH_WEST := Vector2i(9, 1)
const EDGE_UP := Vector2i(11, -2)
## Toutes les voisines de INNER, Cœur et cases de départ comprises : INNER devient une Rosace.
const AROUND_INNER: Array[Vector2i] = [ABOVE, BELOW, WEST, SOUTH_WEST]

var _sim: Simulation


func before_each() -> void:
	_sim = Simulation.new(SimDefs.from_mode(DUEL), 1, 1)


func _colony() -> ColonyState:
	return _sim.state.colonies[0]


func _index(cell: Vector2i) -> int:
	return _sim.cell_index(cell)


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


func _build(cell: Vector2i, id: StringName) -> TickResult:
	return _sim.tick([BuildCommand.new(cell, id)])


## Joue des ticks jusqu'à ce que le bâtiment de la case soit construit (au plus 30).
func _finish(cell: Vector2i) -> void:
	for i: int in range(30):
		if _sim.state.building_state[_index(cell)] == GameState.BuildState.BUILT:
			return
		_sim.tick()


## Relève le seuil du palier 1 : la colonie retombe au palier 0 au prochain tick.
func _lose_first_tier() -> void:
	_sim.state.defs.tier_cells[0] = 100


func _set_building(cell: Vector2i, id: StringName) -> void:
	var index: int = _index(cell)
	_sim.state.building[index] = _sim.state.defs.building_index(id)
	_sim.state.building_state[index] = GameState.BuildState.BUILT
	Buildings.refresh_activity(_sim.state)


func test_data_has_the_five_buildings_of_g2() -> void:
	var ids: Array[StringName] = []
	for building: SimBuilding in _sim.state.defs.buildings:
		ids.append(building.id)
	assert_eq(ids, [&"digestion_node", &"granary", &"nursery", &"enzyme_gland", &"mycorrhiza"])


func test_build_pays_queues_then_builds_in_three_seconds() -> void:
	var before: int = _colony().nutrients
	var result: TickResult = _build(INNER, &"digestion_node")
	assert_eq(result.refused.size(), 0)
	# 2 U payés tout de suite ; le chantier démarre au même tick (2 chantiers libres).
	assert_eq(_colony().nutrients, before - 60_000 + _colony().production)
	assert_eq(_sim.state.building_state[_index(INNER)], GameState.BuildState.CONSTRUCTING)
	_sim.tick()
	result = _sim.tick()
	assert_eq(_sim.state.building_state[_index(INNER)], GameState.BuildState.BUILT)
	assert_eq(result.buildings_completed, PackedInt32Array([0, _index(INNER)]))
	assert_eq(_sim.state.building_active[_index(INNER)], 1)


func test_digestion_node_adds_half_of_the_cell_yield() -> void:
	var cell: int = _index(INNER)
	# Rendement 3,333 ×1,5, puis Cohésion de 2 voisines (+10 %).
	_set_building(INNER, &"digestion_node")
	var expected: int = Fixed.mul(Fixed.mul(3_333, 1_500), 1_100)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, cell), expected)


func test_build_refusals() -> void:
	var commands: Array[Command] = [
		BuildCommand.new(HEART, &"digestion_node"),
		BuildCommand.new(ABOVE, &"digestion_node"),
		BuildCommand.new(INNER, &"granary"),
		BuildCommand.new(INNER, &"castle"),
		BuildCommand.new(INNER, &"digestion_node"),
		BuildCommand.new(INNER, &"digestion_node"),
	]
	var result: TickResult = _sim.tick(commands)
	assert_eq(
		result.refused_codes,
		PackedInt32Array(
			[
				Refusal.Code.HEART_CELL,
				Refusal.Code.NOT_OWNED,
				Refusal.Code.TIER_LOCKED,
				Refusal.Code.UNKNOWN_BUILDING,
				Refusal.Code.CELL_OCCUPIED,
			]
		)
	)


func test_not_enough_nutrients() -> void:
	_colony().nutrients = 59_999
	var result: TickResult = _build(INNER, &"digestion_node")
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.NOT_ENOUGH_NUTRIENTS]))


func test_cost_grows_twelve_percent_per_building_of_the_same_type() -> void:
	assert_eq(_sim.building_cost(0, &"digestion_node"), 60_000)
	_build(INNER, &"digestion_node")
	assert_eq(_sim.building_cost(0, &"digestion_node"), 67_200)
	# Démolir fait baisser le prix suivant.
	_sim.tick([DemolishCommand.new(INNER)])
	assert_eq(_sim.building_cost(0, &"digestion_node"), 60_000)


func test_build_queue_holds_five_and_two_sites_work_at_once() -> void:
	_own(AROUND_INNER)
	_colony().nutrients = 900_000
	var cells: Array[Vector2i] = [INNER, EDGE, ABOVE, BELOW, WEST, SOUTH_WEST]
	var commands: Array[Command] = []
	for cell: Vector2i in cells:
		commands.append(BuildCommand.new(cell, &"digestion_node"))
	var result: TickResult = _sim.tick(commands)
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.BUILD_QUEUE_FULL]))
	assert_eq(_colony().constructing.size(), 2)
	assert_eq(_colony().build_queue.size(), 3)
	assert_eq(Buildings.sites(_sim.state, _colony()), 2)


func test_demolish_refunds_by_state() -> void:
	_own(AROUND_INNER)
	_colony().nutrients = 900_000
	var commands: Array[Command] = [
		BuildCommand.new(INNER, &"digestion_node"),
		BuildCommand.new(EDGE, &"digestion_node"),
		BuildCommand.new(ABOVE, &"digestion_node"),
	]
	_sim.tick(commands)
	# INNER et EDGE en chantier, ABOVE en file.
	assert_eq(_sim.state.building_state[_index(ABOVE)], GameState.BuildState.QUEUED)
	var paid_queued: int = _sim.state.building_paid[_index(ABOVE)]
	var paid_site: int = _sim.state.building_paid[_index(EDGE)]
	var nutrients: int = _colony().nutrients
	_sim.tick([DemolishCommand.new(ABOVE), DemolishCommand.new(EDGE)])
	var production: int = _colony().production
	assert_eq(_colony().nutrients, nutrients + paid_queued + Fixed.mul(paid_site, 500) + production)
	assert_eq(_sim.state.building[_index(ABOVE)], -1)
	assert_true(_colony().build_queue.is_empty())
	assert_eq(_colony().constructing, PackedInt32Array([_index(INNER)]))
	_finish(INNER)
	var paid_built: int = _sim.state.building_paid[_index(INNER)]
	nutrients = _colony().nutrients
	var result: TickResult = _sim.tick([DemolishCommand.new(INNER), DemolishCommand.new(INNER)])
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.NO_BUILDING]))
	assert_eq(_colony().nutrients, nutrients + Fixed.mul(paid_built, 500) + _colony().production)


func test_buildings_deactivate_below_their_tier_and_come_back() -> void:
	_own(AROUND_INNER)
	assert_eq(_colony().tier, 1)
	_set_building(BELOW, &"granary")
	assert_eq(Buildings.stock_seconds(_sim.state, _colony()), 300)
	# La colonie retombe au palier 0 : le Grenier se désactive sans disparaître.
	_lose_first_tier()
	_sim.tick()
	assert_eq(_colony().tier, 0)
	assert_eq(_sim.state.building_active[_index(BELOW)], 0)
	assert_eq(_sim.state.building[_index(BELOW)], _sim.state.defs.building_index(&"granary"))
	assert_eq(Buildings.stock_seconds(_sim.state, _colony()), 180)
	_sim.state.defs.tier_cells[0] = 5
	_sim.tick()
	assert_eq(_sim.state.building_active[_index(BELOW)], 1)


func test_starting_buildings_never_deactivate() -> void:
	var node: SimBuilding = _sim.state.defs.buildings[0]
	assert_false(node.can_deactivate())
	_set_building(INNER, &"digestion_node")
	_lose_first_tier()
	_sim.tick()
	assert_eq(_sim.state.building_active[_index(INNER)], 1)


func test_a_locked_queued_building_waits_without_blocking_the_next() -> void:
	_own(AROUND_INNER)
	_colony().nutrients = 900_000
	# Deux chantiers occupés, puis un Grenier et un Nœud en file.
	var commands: Array[Command] = [
		BuildCommand.new(INNER, &"digestion_node"),
		BuildCommand.new(EDGE, &"digestion_node"),
		BuildCommand.new(ABOVE, &"granary"),
		BuildCommand.new(BELOW, &"digestion_node"),
	]
	_sim.tick(commands)
	assert_eq(_colony().build_queue, PackedInt32Array([_index(ABOVE), _index(BELOW)]))
	# La colonie retombe au palier 0 : le Grenier n'est plus débloqué.
	_lose_first_tier()
	for i: int in range(3):
		_sim.tick()
	assert_eq(_colony().build_queue, PackedInt32Array([_index(ABOVE)]))
	assert_true(_colony().constructing.has(_index(BELOW)))
	assert_eq(_sim.state.building_state[_index(ABOVE)], GameState.BuildState.QUEUED)


func test_neighbouring_nodes_and_rosace_multiply_the_bonus() -> void:
	_own(AROUND_INNER)
	var cell: int = _index(INNER)
	var plain: int = Buildings.production_factor(_sim.state, 0, cell)
	assert_eq(plain, Fixed.ONE)
	_set_building(INNER, &"digestion_node")
	# INNER est une Rosace (6 voisines possédées) : ×1,5 × 1,1.
	assert_eq(Buildings.production_factor(_sim.state, 0, cell), 1650)
	for neighbor: Vector2i in [ABOVE, BELOW, WEST, SOUTH_WEST]:
		_set_building(neighbor, &"digestion_node")
	# 4 Nœuds voisins : +40 %, plafonné à +30 % → ×1,5 × 1,3 × 1,1.
	assert_eq(Buildings.production_factor(_sim.state, 0, cell), Fixed.mul(1950, 1100))
	# Un Nœud voisin désactivé ne compte pas.
	_sim.state.building_active[_index(ABOVE)] = 0
	_sim.state.building_active[_index(BELOW)] = 0
	_sim.state.building_active[_index(WEST)] = 0
	assert_eq(Buildings.production_factor(_sim.state, 0, cell), Fixed.mul(1650, 1100))


func test_enzyme_gland_makes_twenty_enzymes_a_minute() -> void:
	var more: Array[Vector2i] = [
		EDGE_UP, Vector2i(9, 2), Vector2i(8, 1), Vector2i(8, 2), Vector2i(8, 0)
	]
	_own(AROUND_INNER + more)
	assert_eq(_colony().tier, 2)
	_set_building(EDGE_UP, &"enzyme_gland")
	_sim.tick()
	assert_eq(_colony().enzyme_production, 333)
	assert_eq(_colony().enzymes, 333)
	_set_building(EDGE, &"enzyme_gland")
	_sim.tick()
	# Deux Glandes voisines : chacune +10 %.
	assert_eq(_colony().enzyme_production, 2 * Fixed.div_round(22_000, 60))


func test_stock_is_capped_at_three_minutes_of_production() -> void:
	_colony().nutrients = 50_000_000
	_sim.tick()
	assert_eq(_colony().stock_cap, _colony().production * 180)
	assert_eq(_colony().nutrients, _colony().stock_cap)
	# La Biomasse compte toute la production, plafond ou pas.
	assert_eq(_colony().biomass, _colony().production)


func test_nursery_speeds_up_growth_nearby_and_is_recomputed_each_tick() -> void:
	_own(AROUND_INNER)
	_set_building(INNER, &"nursery")
	assert_eq(Buildings.growth_speed(_sim.state, _colony(), _index(EDGE_UP)), 1429)
	_sim.tick([ColonizeCommand.new(EDGE_UP)])
	_sim.tick()
	# 4 s ×0,7 : 3 ticks au lieu de 4.
	_sim.tick()
	assert_eq(_sim.state.cell_state[_index(EDGE_UP)], GameState.CellState.OWNED)
	# Démolie pendant une pousse : la pousse ralentit tout de suite.
	_sim.tick([ColonizeCommand.new(Vector2i(11, -3))])
	var left: int = _sim.state.growth_left[_index(Vector2i(11, -3))]
	_sim.tick([DemolishCommand.new(INNER)])
	assert_eq(_sim.state.growth_left[_index(Vector2i(11, -3))], left - 1000)


func test_nursery_adds_a_site_and_mycorrhiza_a_growth() -> void:
	_own(AROUND_INNER)
	_set_building(INNER, &"nursery")
	assert_eq(Buildings.sites(_sim.state, _colony()), 3)
	_set_building(EDGE, &"nursery")
	_set_building(ABOVE, &"nursery")
	assert_eq(Buildings.sites(_sim.state, _colony()), 4)
	assert_eq(Buildings.max_growths(_sim.state, _colony()), 1)
	_colony().tier = 3
	_set_building(BELOW, &"mycorrhiza")
	_set_building(WEST, &"mycorrhiza")
	_set_building(SOUTH_WEST, &"mycorrhiza")
	assert_eq(Buildings.max_growths(_sim.state, _colony()), 3)


func test_build_commands_survive_a_round_trip() -> void:
	var command := BuildCommand.new(Vector2i(2, -3), &"granary", 1)
	command.tick = 5
	var copy: Command = Command.from_dict(command.to_dict())
	assert_true(copy is BuildCommand)
	assert_eq(copy.to_dict(), command.to_dict())
	var demolish := DemolishCommand.new(Vector2i(0, 1), 2)
	assert_eq(Command.from_dict(demolish.to_dict()).to_dict(), demolish.to_dict())


func test_buildings_are_deterministic_and_part_of_the_state_hash() -> void:
	var other := Simulation.new(SimDefs.from_mode(DUEL), 1, 1)
	var before: int = _sim.state_hash()
	assert_eq(other.state_hash(), before)
	var commands: Array[Command] = [BuildCommand.new(INNER, &"digestion_node")]
	var copies: Array[Command] = [BuildCommand.new(INNER, &"digestion_node")]
	_sim.tick(commands)
	other.tick(copies)
	for i: int in range(5):
		_sim.tick()
		other.tick()
	assert_eq(_sim.state_hash(), other.state_hash())
	other.tick([DemolishCommand.new(INNER)])
	_sim.tick()
	assert_ne(_sim.state_hash(), other.state_hash())


func test_defs_round_trip_keeps_the_buildings() -> void:
	var defs: SimDefs = _sim.state.defs
	var copy: SimDefs = SimDefs.from_dict(defs.to_dict())
	assert_eq(copy.to_dict(), defs.to_dict())
	assert_eq(copy.validate(), PackedStringArray())
	assert_eq(copy.building_index(&"mycorrhiza"), 4)
