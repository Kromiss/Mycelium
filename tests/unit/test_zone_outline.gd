extends GutTest
## Tests du contour arrondi des zones.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const FFA: ModeDef = preload("res://data/modes/ffa.tres")
const ZONES: ZoneTable = preload("res://data/zones.tres")
const SIZE: float = 32.0
## Rayon des bulles utilisé par l'affichage (ForestView.bubble_ratio).
const BUBBLE_RATIO: float = 0.62


func test_each_region_has_a_closed_outline() -> void:
	var map: ForestMap = MapGenerator.generate(FFA, ZONES.count())
	for zone: int in range(1, 7):
		var outline: PackedVector2Array = ZoneOutline.region_outline(map, zone, SIZE)
		assert_gt(outline.size(), 6, "zone %d" % zone)


func test_outlines_are_nested_and_get_smaller_towards_the_center() -> void:
	var map: ForestMap = MapGenerator.generate(DUEL, ZONES.count())
	var previous_area: float = INF
	for zone: int in range(1, 7):
		var area: float = _area(ZoneOutline.region_outline(map, zone, SIZE))
		assert_lt(area, previous_area, "zone %d" % zone)
		previous_area = area


func test_outline_never_touches_a_bubble() -> void:
	# Le trait de chaque zone doit passer entre les bulles, sans en couper aucune.
	var map: ForestMap = MapGenerator.generate(FFA, ZONES.count())
	var bubble_radius: float = SIZE * BUBBLE_RATIO
	for zone: int in range(2, 7):
		var outline: PackedVector2Array = ZoneOutline.region_outline(map, zone, SIZE)
		for index: int in range(map.size()):
			var center: Vector2 = Hex.to_pixel(map.cells[index], SIZE)
			assert_gt(_distance_to_loop(center, outline), bubble_radius)


func test_smoothing_doubles_points_each_pass() -> void:
	var square := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	assert_eq(ZoneOutline.smooth(square, 1).size(), 8)
	assert_eq(ZoneOutline.smooth(square, 2).size(), 16)


func _area(loop: PackedVector2Array) -> float:
	var total: float = 0.0
	for i: int in range(loop.size()):
		var a: Vector2 = loop[i]
		var b: Vector2 = loop[(i + 1) % loop.size()]
		total += a.x * b.y - b.x * a.y
	return absf(total) * 0.5


func _distance_to_loop(point: Vector2, loop: PackedVector2Array) -> float:
	var best: float = INF
	for i: int in range(loop.size()):
		var a: Vector2 = loop[i]
		var b: Vector2 = loop[(i + 1) % loop.size()]
		var closest: Vector2 = Geometry2D.get_closest_point_to_segment(point, a, b)
		best = minf(best, point.distance_to(closest))
	return best
