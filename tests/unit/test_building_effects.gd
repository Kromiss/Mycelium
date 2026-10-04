extends GutTest
## Effets des bâtiments de G2 (GDD §7.2, §7.3) : rendement, voisinage et Rosace, Enzymes,
## plafond de stock, Pépinière et Mycorhize.

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


func test_digestion_node_adds_half_of_the_cell_yield() -> void:
	var cell: int = _index(INNER)
	# Rendement 3,333 ×1,5, puis Cohésion de 2 voisines (+10 %).
	_set_building(INNER, &"digestion_node")
	var expected: int = Fixed.mul(Fixed.mul(3_333, 1_500), 1_100)
	assert_eq(EconomySystem.cell_production(_sim.state, 0, cell), expected)


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
