class_name BuildingLayer
extends Node2D
## Bâtiments de la colonie sur la carte (GDD §13.2) : pictogramme au centre de la case selon
## son état (en file avec son numéro, chantier avec jauge, actif, désactivé avec cadenas) ;
## portée de la Pépinière quand on la place ou qu'on la survole ; en mode palette, fantôme du
## bâtiment et coût sur une case où la pose est possible, case barrée sinon.
## Ne fait que lire l'état de la partie.

## Taille du disque d'un bâtiment par rapport à la bulle de la case.
@export var disc_ratio: float = 0.78
## Opacité du fantôme en mode palette.
@export var ghost_alpha: float = 0.6

var _view: ForestView
var _session: Session
var _dark: Color = Color.BLACK
var _font: Font
var _hover: int = -1
var _placing: StringName = &""
## Cases à entourer pour montrer une portée (Pépinière), et case d'où elle part.
var _range_cells := PackedInt32Array()
var _range_origin: int = -1
var _ghost: Node2D


## Prépare l'affichage pour une partie et une couleur de colonie.
func setup(view: ForestView, session: Session, dark: Color) -> void:
	_view = view
	_session = session
	_dark = dark
	_font = ThemeFactory.title_font()
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_ghost = Node2D.new()
	_ghost.modulate.a = ghost_alpha
	_ghost.texture_filter = texture_filter
	add_child(_ghost)
	_ghost.draw.connect(_draw_ghost)
	refresh()


## Recalcule ce qui dépend de l'état (à appeler après chaque tick).
func refresh() -> void:
	_update_range()
	queue_redraw()
	if _ghost != null:
		_ghost.queue_redraw()


## Case survolée par la souris (−1 : aucune).
func set_hover(cell: int) -> void:
	if cell == _hover:
		return
	_hover = cell
	refresh()


## Bâtiment choisi dans la palette (vide : pas de mode palette).
func set_placing(building: StringName) -> void:
	_placing = building
	refresh()


func _process(_delta: float) -> void:
	if _session != null and not _session.simulation.state.finished:
		# Les jauges des chantiers avancent entre deux ticks.
		queue_redraw()


func _draw() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var palette: Palette = Settings.palette()
	var radius: float = _view.bubble_radius() * disc_ratio
	_draw_range()
	for cell: int in range(state.cell_count()):
		var type: int = state.building[cell]
		if type < 0 or state.owner[cell] != colony.id:
			continue
		var id: StringName = state.defs.buildings[type].id
		var center: Vector2 = _view.cell_center(cell)
		match state.building_state[cell]:
			GameState.BuildState.QUEUED:
				BuildingIcons.draw_planned(self, id, center, radius, _dark, palette, -1.0)
				_draw_number(center, radius, colony.build_queue.find(cell) + 1, palette)
			GameState.BuildState.CONSTRUCTING:
				var progress: float = _build_progress(state, cell, type)
				BuildingIcons.draw_planned(self, id, center, radius, _dark, palette, progress)
			_:
				if state.building_active[cell] == 1:
					BuildingIcons.draw_built(self, id, center, radius, _dark, palette)
				else:
					BuildingIcons.draw_off(self, id, center, radius, palette)


## Avancement d'un chantier (0 à 1), lissé entre deux ticks.
func _build_progress(state: GameState, cell: int, type: int) -> float:
	var total: float = float(Buildings.build_ticks(state, type))
	var done: float = total - float(state.build_left[cell]) + _session.tick_fraction()
	return clampf(done / maxf(1.0, total), 0.0, 1.0)


## Numéro d'ordre d'un bâtiment dans la file de construction, dans une pastille.
func _draw_number(center: Vector2, radius: float, number: int, palette: Palette) -> void:
	var badge: Vector2 = center + Vector2(radius * 0.7, -radius * 0.7)
	var badge_radius: float = radius * 0.48
	draw_circle(badge, badge_radius, palette.card)
	draw_arc(badge, badge_radius, 0.0, TAU, 24, _dark, 1.5, true)
	var size: int = roundi(badge_radius * 1.3)
	var baseline: Vector2 = badge + Vector2(-badge_radius, size * 0.36)
	draw_string(
		_font, baseline, str(number), HORIZONTAL_ALIGNMENT_CENTER, badge_radius * 2.0, size, _dark
	)


func _draw_range() -> void:
	var color: Color = _dark
	color.a = 0.55
	var radius: float = _view.bubble_radius()
	for cell: int in _range_cells:
		draw_arc(_view.cell_center(cell), radius + 2.0, 0.0, TAU, 24, color, 2.0, true)


## Fantôme du bâtiment choisi sur la case survolée, ou case barrée si la pose est impossible.
func _draw_ghost() -> void:
	if _session == null or _placing == &"" or _hover < 0:
		return
	var state: GameState = _session.simulation.state
	var coords: Vector2i = state.map.cells[_hover]
	var center: Vector2 = _view.cell_center(_hover)
	var palette: Palette = Settings.palette()
	var radius: float = _view.bubble_radius() * disc_ratio
	var code: Refusal.Code = _session.simulation.check_build(
		_session.local_colony, coords, _placing
	)
	if code != Refusal.Code.OK:
		var arm: float = radius * 0.7
		var width: float = maxf(3.0, radius * 0.2)
		_ghost.draw_line(
			center - Vector2(arm, arm), center + Vector2(arm, arm), palette.warning, width
		)
		_ghost.draw_line(
			center + Vector2(-arm, arm), center + Vector2(arm, -arm), palette.warning, width
		)
		return
	BuildingIcons.draw_built(_ghost, _placing, center, radius, _dark, palette)
	var cost: int = _session.simulation.building_cost(_session.local_colony, _placing)
	var size: int = roundi(radius * 0.8)
	var width_text: float = radius * 4.0
	var baseline: Vector2 = center + Vector2(-width_text * 0.5, radius + size * 1.1)
	_ghost.draw_string(
		_font,
		baseline,
		NumberFormat.amount(cost),
		HORIZONTAL_ALIGNMENT_CENTER,
		width_text,
		size,
		palette.text
	)


## Portée à montrer : la Pépinière qu'on place (case survolée) ou celle qu'on survole.
func _update_range() -> void:
	_range_cells = PackedInt32Array()
	_range_origin = -1
	if _session == null or _hover < 0:
		return
	var state: GameState = _session.simulation.state
	var type: int = -1
	if _placing != &"":
		type = state.defs.building_index(_placing)
	elif state.building[_hover] >= 0 and state.owner[_hover] == _session.local_colony:
		type = state.building[_hover]
	if type < 0:
		return
	var reach: int = state.defs.buildings[type].effect_radius
	if reach <= 0:
		return
	_range_origin = _hover
	var origin: Vector2i = state.map.cells[_hover]
	for cell: int in range(state.cell_count()):
		if Hex.distance(origin, state.map.cells[cell]) <= reach:
			_range_cells.append(cell)
