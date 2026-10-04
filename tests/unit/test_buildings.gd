extends GutTest
## City builder (GDD §7) : pose, file de construction, chantiers, démolition et désactivation
## des bâtiments de G2. Leurs effets sont testés dans test_building_effects.gd.

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


func test_cost_is_seconds_of_production_and_at_least_its_units() -> void:
	# Avant le premier tick, la production est nulle : le minimum (2 U) s'applique.
	assert_eq(_sim.building_cost(0, &"digestion_node"), 60_000)
	_colony().production = 10_000
	assert_eq(_sim.building_cost(0, &"digestion_node"), 600_000)
	assert_eq(_sim.building_cost(0, &"granary"), 450_000)
	_colony().production = 100
	assert_eq(_sim.building_cost(0, &"granary"), 90_000)


func test_places_grow_with_tiers_and_every_building_takes_one() -> void:
	assert_eq(Buildings.slots(_sim.state, _colony()), 2)
	_colony().nutrients = 900_000
	var commands: Array[Command] = [
		BuildCommand.new(INNER, &"digestion_node"), BuildCommand.new(EDGE, &"digestion_node")
	]
	_sim.tick(commands)
	_own(AROUND_INNER)
	_colony().nutrients = 900_000
	_colony().production = 0
	assert_eq(Buildings.slots(_sim.state, _colony()), 3)
	var more: Array[Command] = [
		BuildCommand.new(ABOVE, &"digestion_node"), BuildCommand.new(BELOW, &"digestion_node")
	]
	var result: TickResult = _sim.tick(more)
	assert_eq(result.refused_codes, PackedInt32Array([Refusal.Code.NO_BUILDING_SLOT]))
	assert_eq(Buildings.placed_count(_sim.state, _colony()), 3)
	# Démolir libère une place.
	_sim.tick([DemolishCommand.new(ABOVE)])
	_colony().nutrients = 50_000_000
	assert_eq(_sim.check_build(0, BELOW, &"digestion_node"), Refusal.Code.OK)


func test_build_queue_holds_five_and_two_sites_work_at_once() -> void:
	_own(AROUND_INNER)
	_sim.state.defs.building_slots_base = 20
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
	_sim.state.defs.building_slots_base = 20
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


func test_refund_is_full_in_the_queue_and_half_afterwards() -> void:
	_own(AROUND_INNER)
	_colony().nutrients = 900_000
	var commands: Array[Command] = [
		BuildCommand.new(INNER, &"digestion_node"),
		BuildCommand.new(EDGE, &"digestion_node"),
		BuildCommand.new(ABOVE, &"digestion_node"),
	]
	_sim.tick(commands)
	assert_eq(Buildings.refund(_sim.state, _index(ABOVE)), _sim.state.building_paid[_index(ABOVE)])
	assert_eq(Buildings.refund(_sim.state, _index(INNER)), 30_000)
