extends GutTest
## Tests de la génération de la forêt.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
const ZONES: ZoneTable = preload("res://data/zones.tres")


func test_duel_forest_has_radius_11_and_397_cells() -> void:
	var map: ForestMap = MapGenerator.generate(DUEL, ZONES.count())
	assert_eq(map.radius, 11)
	assert_eq(map.size(), 397)


func test_ffa_forest_has_radius_17_and_919_cells() -> void:
	var map: ForestMap = MapGenerator.generate(FFA, ZONES.count())
	assert_eq(map.radius, 17)
	assert_eq(map.size(), 919)


func test_every_cell_is_humus() -> void:
	var map: ForestMap = MapGenerator.generate(DUEL, ZONES.count())
	for terrain: int in map.terrains:
		assert_eq(terrain, ForestMap.Terrain.HUMUS)


func test_center_is_in_the_last_zone_and_edge_in_zone_one() -> void:
	var map: ForestMap = MapGenerator.generate(FFA, ZONES.count())
	assert_eq(map.zone_of(Vector2i.ZERO), 6)
	assert_eq(map.zone_of(Vector2i(map.radius, 0)), 1)


func test_each_zone_is_exactly_rings_per_zone_thick() -> void:
	for mode: ModeDef in [DUEL, FFA]:
		var map: ForestMap = MapGenerator.generate(mode, ZONES.count())
		for zone: int in range(1, 7):
			var distances: Dictionary[int, bool] = {}
			for index: int in range(map.size()):
				if map.zones[index] == zone:
					distances[Hex.length(map.cells[index])] = true
			assert_eq(distances.size(), mode.rings_per_zone, "zone %d" % zone)


func test_zone_cell_counts_add_up() -> void:
	var map: ForestMap = MapGenerator.generate(FFA, ZONES.count())
	var total: int = 0
	for zone: int in range(1, 7):
		total += map.count_in_zone(zone)
	assert_eq(total, map.size())
	# La Clairière (zone 6) du FFA : la case centrale et deux anneaux autour.
	assert_eq(map.count_in_zone(6), Hex.cell_count(2))


func test_index_lookup() -> void:
	var map: ForestMap = MapGenerator.generate(DUEL, ZONES.count())
	for index: int in range(map.size()):
		assert_eq(map.index_of(map.cells[index]), index)
	assert_eq(map.index_of(Vector2i(100, 100)), -1)
	assert_false(map.has_cell(Vector2i(map.radius + 1, 0)))


func test_generation_is_deterministic() -> void:
	var first: ForestMap = MapGenerator.generate(FFA, ZONES.count(), 42)
	var second: ForestMap = MapGenerator.generate(FFA, ZONES.count(), 42)
	assert_eq(first.cells, second.cells)
	assert_eq(first.zones, second.zones)
