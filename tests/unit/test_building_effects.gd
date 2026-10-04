extends GutTest
## Effets des bâtiments de G2 (GDD §7.2, revus le 4 octobre 2026) : rendement et Enzymes sur une
## zone sans cumul, plafond de stock, Pépinière et Mycorhize.

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
## Toutes les voisines de INNER, Cœur et cases de départ comprises.
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


func test_digestion_node_boosts_colony_cells_within_two() -> void:
	var far := Vector2i(7, 0)
	_own([WEST, Vector2i(8, 0), far])
	_set_building(INNER, &"digestion_node")
	for cell: Vector2i in [HEART, EDGE, INNER, WEST, Vector2i(8, 0)]:
		assert_eq(Buildings.production_factor(_sim.state, 0, _index(cell)), 1300)
	assert_eq(Buildings.production_factor(_sim.state, 0, _index(far)), Fixed.ONE)
	# Rendement 3,333 ×1,3, puis Cohésion de 3 voisines (+15 %).
	var expected: int = Fixed.mul(Fixed.mul(3_333, 1_300), 1_150)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, _index(INNER)), expected)


func test_overlapping_nodes_do_not_add_up_and_a_cut_node_does_nothing() -> void:
	_own(AROUND_INNER)
	_set_building(INNER, &"digestion_node")
	_set_building(EDGE, &"digestion_node")
	assert_eq(Buildings.production_factor(_sim.state, 0, _index(INNER)), 1300)
	assert_eq(Buildings.covered_cells(_sim.state, 0, _index(INNER)), 7)
	# Plus de voisinage ni de Rosace : INNER, entourée de 6 cases, reste à ×1,3.
	Buildings.clear(_sim.state, _index(EDGE))
	_sim.state.connected[_index(INNER)] = 0
	assert_eq(Buildings.production_factor(_sim.state, 0, _index(HEART)), Fixed.ONE)


func test_enzyme_gland_gives_one_enzyme_a_minute_per_covered_cell() -> void:
	var more: Array[Vector2i] = [
		EDGE_UP, Vector2i(9, 2), Vector2i(8, 1), Vector2i(8, 2), Vector2i(8, 0)
	]
	_own(AROUND_INNER + more)
	assert_eq(_colony().tier, 2)
	_set_building(EDGE_UP, &"enzyme_gland")
	_sim.tick()
	var covered: int = _covered([EDGE_UP])
	assert_eq(_colony().enzyme_production, Fixed.div_round(covered * Fixed.ONE, 60))
	assert_eq(_colony().enzymes, _colony().enzyme_production)
	# Une seconde Glande : les cases couvertes deux fois ne comptent qu'une fois.
	_set_building(Vector2i(8, 2), &"enzyme_gland")
	_sim.tick()
	var both: int = _covered([EDGE_UP, Vector2i(8, 2)])
	assert_lt(both, covered + _covered([Vector2i(8, 2)]))
	assert_eq(_colony().enzyme_production, Fixed.div_round(both * Fixed.ONE, 60))


## Cases reliées de la colonie à 2 cases ou moins d'au moins une des cases données.
func _covered(glands: Array[Vector2i]) -> int:
	var total: int = 0
	for cell: int in range(_sim.state.cell_count()):
		if _sim.state.connected[cell] == 0 or _sim.state.owner[cell] != 0:
			continue
		for gland: Vector2i in glands:
			if Hex.distance(gland, _sim.state.map.cells[cell]) <= 2:
				total += 1
				break
	return total


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


func test_nursery_adds_no_site_and_mycorrhiza_adds_a_growth() -> void:
	_own(AROUND_INNER)
	_set_building(INNER, &"nursery")
	assert_eq(Buildings.sites(_sim.state, _colony()), 2)
	assert_eq(Buildings.max_growths(_sim.state, _colony()), 1)
	_colony().tier = 3
	_set_building(BELOW, &"mycorrhiza")
	_set_building(WEST, &"mycorrhiza")
	_set_building(SOUTH_WEST, &"mycorrhiza")
	assert_eq(Buildings.max_growths(_sim.state, _colony()), 3)
