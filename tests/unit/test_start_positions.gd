extends GutTest
## Positions de départ des colonies (GDD §3.1) : Cœur sur un coin, une case vers le centre,
## une case sur le bord ; départs identiques d'un secteur à l'autre.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")


func test_turret_is_on_a_corner_of_the_outer_ring() -> void:
	for radius: int in [11, 17]:
		var cells: Array[Vector2i] = MapGenerator.start_cells(radius, 0, 6)
		assert_eq(cells.size(), MapGenerator.START_CELLS)
		assert_eq(cells[MapGenerator.START_TURRET], Vector2i(radius, 0))
		assert_eq(Hex.length(cells[0]), radius)


func test_one_cell_towards_the_center_and_one_on_the_edge() -> void:
	var radius: int = 11
	var cells: Array[Vector2i] = MapGenerator.start_cells(radius, 0, 2)
	assert_eq(cells[1], Vector2i(radius - 1, 0))
	assert_eq(Hex.length(cells[1]), radius - 1)
	# La case du bord est au-dessus du Cœur pour le coin est.
	assert_eq(cells[2], Vector2i(radius, -1))
	assert_eq(Hex.length(cells[2]), radius)
	for cell: Vector2i in cells.slice(1):
		assert_eq(Hex.distance(cell, cells[0]), 1)
	assert_eq(Hex.distance(cells[1], cells[2]), 1)


func test_duel_colonies_face_each_other() -> void:
	var first: Array[Vector2i] = MapGenerator.start_cells(11, 0, 2)
	var second: Array[Vector2i] = MapGenerator.start_cells(11, 1, 2)
	# Symétrie centrale : chaque case de départ a son opposée chez l'adversaire.
	for i: int in range(first.size()):
		assert_eq(second[i], -first[i])


func test_starts_are_rotations_of_each_other() -> void:
	for sectors: int in [2, 3, 6]:
		@warning_ignore("integer_division")
		var steps: int = 6 / sectors
		var reference: Array[Vector2i] = MapGenerator.start_cells(17, 0, sectors)
		for sector: int in range(1, sectors):
			var cells: Array[Vector2i] = MapGenerator.start_cells(17, sector, sectors)
			for i: int in range(reference.size()):
				assert_eq(
					cells[i], _rotate(reference[i], sector * steps), "%d/%d" % [sector, sectors]
				)


func test_starts_are_inside_zone_one_and_never_overlap() -> void:
	for mode: ModeDef in [DUEL, FFA]:
		var map: ForestMap = MapGenerator.generate(mode, 6)
		var used: Dictionary[Vector2i, bool] = {}
		for sector: int in range(mode.colonies):
			for cell: Vector2i in MapGenerator.start_cells(map.radius, sector, mode.colonies):
				assert_true(map.has_cell(cell))
				assert_eq(map.zone_of(cell), 1)
				assert_false(used.has(cell))
				used[cell] = true


## Rotation d'une case de « steps » sixièmes de tour autour du centre, dans le sens qui fait
## passer de la direction 0 à la direction 1 de Hex.DIRECTIONS.
func _rotate(cell: Vector2i, steps: int) -> Vector2i:
	var result: Vector2i = cell
	for i: int in range(steps):
		result = Vector2i(result.x + result.y, -result.x)
	return result
