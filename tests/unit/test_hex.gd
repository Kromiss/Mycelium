extends GutTest
## Tests de la grille d'hexagones.


func test_six_neighbors_at_distance_one() -> void:
	var cell := Vector2i(2, -1)
	var neighbors: Array[Vector2i] = Hex.neighbors(cell)
	assert_eq(neighbors.size(), 6)
	for other: Vector2i in neighbors:
		assert_eq(Hex.distance(cell, other), 1)


func test_distance_is_symmetric() -> void:
	var a := Vector2i(3, -5)
	var b := Vector2i(-2, 4)
	assert_eq(Hex.distance(a, b), Hex.distance(b, a))
	assert_eq(Hex.distance(a, b), 9)


func test_cell_count_matches_generated_cells() -> void:
	for radius: int in [0, 1, 5, 11, 17]:
		assert_eq(Hex.cells_in_radius(radius).size(), Hex.cell_count(radius))


func test_cells_in_radius_have_fixed_order() -> void:
	var first: Array[Vector2i] = Hex.cells_in_radius(4)
	var second: Array[Vector2i] = Hex.cells_in_radius(4)
	assert_eq(first, second)
	assert_eq(first[0], Vector2i(-4, 0))


func test_neighbors_are_one_hex_width_apart_on_screen() -> void:
	var size: float = 10.0
	var center: Vector2 = Hex.to_pixel(Vector2i.ZERO, size)
	for other: Vector2i in Hex.neighbors(Vector2i.ZERO):
		var gap: float = center.distance_to(Hex.to_pixel(other, size))
		assert_almost_eq(gap, size * Hex.SQRT3, 0.001)


func test_edge_corners_are_shared_with_the_neighbor() -> void:
	# Le côté qui fait face à un voisin est le même segment, vu depuis chacune des deux cases.
	var size: float = 10.0
	var cell := Vector2i.ZERO
	for direction: int in range(6):
		var other: Vector2i = Hex.neighbor(cell, direction)
		var opposite: int = (direction + 3) % 6
		var mine: Vector2i = Hex.edge_corners(direction)
		var theirs: Vector2i = Hex.edge_corners(opposite)
		var a: Vector2 = Hex.corner(Hex.to_pixel(cell, size), size, mine.x)
		var b: Vector2 = Hex.corner(Hex.to_pixel(cell, size), size, mine.y)
		var c: Vector2 = Hex.corner(Hex.to_pixel(other, size), size, theirs.x)
		var d: Vector2 = Hex.corner(Hex.to_pixel(other, size), size, theirs.y)
		# Parcouru en sens inverse depuis la case voisine.
		assert_almost_eq(a, d, Vector2(0.001, 0.001))
		assert_almost_eq(b, c, Vector2(0.001, 0.001))


func test_from_pixel_is_the_inverse_of_to_pixel() -> void:
	for cell: Vector2i in Hex.cells_in_radius(6):
		var center: Vector2 = Hex.to_pixel(cell, 32.0)
		assert_eq(Hex.from_pixel(center, 32.0), cell)
		# Un point proche du centre reste dans la même case.
		assert_eq(Hex.from_pixel(center + Vector2(10.0, -8.0), 32.0), cell)
