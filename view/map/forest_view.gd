class_name ForestView
extends Node2D
## Affichage de la forêt : fond des zones, une bulle par case, trait des zones.
## Ne fait que lire la carte : il ne la modifie jamais.

## Rayon extérieur d'un hexagone, en pixels de carte.
@export var hex_size: float = 32.0
## Rayon d'une bulle, en fraction du rayon de l'hexagone. Doit rester sous 0,75 pour que
## le trait des zones (à mi-chemin entre deux rangées de cases) ne touche aucune bulle.
@export_range(0.3, 0.74) var bubble_ratio: float = 0.62

var _map: ForestMap
var _outlines: Array[PackedVector2Array] = []

@onready var _zone_fill: ZoneLayer = %ZoneFill
@onready var _bubbles: MultiMeshInstance2D = %Bubbles
@onready var _zone_lines: ZoneLayer = %ZoneLines


## Prépare l'affichage d'une carte avec une palette.
func setup(map: ForestMap, palette: Palette) -> void:
	_map = map
	_outlines.clear()
	for zone: int in range(1, map.zone_count + 1):
		_outlines.append(ZoneOutline.region_outline(map, zone, hex_size))
	_build_bubbles()
	apply_palette(palette)


## Applique les couleurs d'un thème (appelé aussi quand le joueur change de thème).
func apply_palette(palette: Palette) -> void:
	if _map == null:
		return
	var fills: Array[Color] = []
	var lines: Array[Color] = []
	for zone: int in range(1, _map.zone_count + 1):
		fills.append(palette.zone_color(zone, _map.zone_count))
		lines.append(palette.zone_line)
	_zone_fill.set_outlines(_outlines, fills)
	_zone_lines.set_outlines(_outlines, lines)
	var multimesh: MultiMesh = _bubbles.multimesh
	for index: int in range(_map.size()):
		multimesh.set_instance_color(
			index, palette.bubble_color(_map.zones[index], _map.zone_count)
		)


## Rectangle qui contient toute la forêt, en pixels de carte.
func bounds() -> Rect2:
	if _outlines.is_empty():
		return Rect2()
	var outer: PackedVector2Array = _outlines[0]
	var rect := Rect2(outer[0], Vector2.ZERO)
	for point: Vector2 in outer:
		rect = rect.expand(point)
	return rect


func _build_bubbles() -> void:
	var diameter: float = 2.0 * hex_size * bubble_ratio
	var quad := QuadMesh.new()
	quad.size = Vector2(diameter, diameter)
	var multimesh := MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_2D
	multimesh.use_colors = true
	multimesh.mesh = quad
	multimesh.instance_count = _map.size()
	for index: int in range(_map.size()):
		var center: Vector2 = Hex.to_pixel(_map.cells[index], hex_size)
		multimesh.set_instance_transform_2d(index, Transform2D(0.0, center))
	_bubbles.multimesh = multimesh
