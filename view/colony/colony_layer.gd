class_name ColonyLayer
extends Node2D
## Affichage de la colonie du joueur, version simple de G1 (GDD §13.2) : cases colorées une par
## une, Cœur dans la teinte foncée, case en pousse avec une jauge qui se remplit, cases
## colonisables marquées (contour ; teinte pâle si payables tout de suite), numéros de la file
## d'expansion, onde continue des bords vers le Cœur et saut du Cœur aux paliers (§6.5).
## Ne fait que lire l'état de la partie.

## Période de l'onde au départ, en secondes ; elle raccourcit à chaque palier.
@export var wave_period: float = 2.6
## Facteur appliqué à la période à chaque palier (onde plus fréquente).
@export var wave_period_per_tier: float = 0.85
## Éclaircissement maximal de l'onde au départ, puis gain par palier (onde plus intense).
@export var wave_strength: float = 0.14
@export var wave_strength_per_tier: float = 0.035
## Longueur d'onde, en cases.
@export var wave_length: float = 5.0
## Durée et hauteur du saut du Cœur quand un palier tombe.
@export var heart_jump_time: float = 0.7
@export var heart_jump_scale: float = 0.45
## Opacité de la teinte des cases payables tout de suite.
@export var affordable_alpha: float = 0.38
## Épaisseurs des contours, en pixels de carte.
@export var outline_width: float = 3.0
@export var gauge_width: float = 6.0

var _view: ForestView
var _session: Session
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _font: Font
## Cases de la colonie (poussées et reliées) et leur distance au Cœur par le réseau.
var _owned := PackedInt32Array()
var _distance := PackedInt32Array()
var _colonizable := PackedInt32Array()
var _affordable := PackedInt32Array()
var _hover: int = -1
var _wave_time: float = 0.0
var _jump_left: float = 0.0


## Prépare l'affichage pour une partie et une couleur de colonie.
func setup(view: ForestView, session: Session, main: Color, dark: Color) -> void:
	_view = view
	_session = session
	_main = main
	_dark = dark
	_font = ThemeFactory.title_font()
	refresh()


## Recalcule ce qui dépend de l'état (à appeler après chaque tick).
func refresh() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	for cell: int in _owned:
		if not state.is_owned_by(cell, colony.id):
			_view.reset_bubble_color(cell)
	_owned = PackedInt32Array()
	_colonizable = PackedInt32Array()
	_affordable = PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if state.connected[cell] == 1 and state.owner[cell] == colony.id:
			_owned.append(cell)
		elif state.cell_state[cell] == GameState.CellState.FREE:
			if state.touches_network(cell, colony.id):
				_colonizable.append(cell)
				if Expansion.cost(state, colony, cell) <= colony.nutrients:
					_affordable.append(cell)
	_distance = _network_distances(state, colony)
	queue_redraw()


## Fait sauter le Cœur (palier atteint).
func jump_heart() -> void:
	_jump_left = heart_jump_time


## Case survolée par la souris (−1 : aucune).
func set_hover(cell: int) -> void:
	if cell != _hover:
		_hover = cell
		queue_redraw()


func _process(delta: float) -> void:
	if _session == null:
		return
	if _session.is_running() and not _session.paused:
		_wave_time += delta
	_jump_left = maxf(0.0, _jump_left - delta)
	_paint_cells()
	queue_redraw()


## Couleur des cases de la colonie, avec l'onde qui remonte vers le Cœur.
func _paint_cells() -> void:
	var colony: ColonyState = _session.colony()
	var tier: int = colony.tier
	var period: float = wave_period * pow(wave_period_per_tier, tier)
	var strength: float = minf(0.4, wave_strength + wave_strength_per_tier * tier)
	for i: int in range(_owned.size()):
		var cell: int = _owned[i]
		if cell == colony.heart:
			_view.set_bubble_color(cell, _dark)
			continue
		# La phase augmente avec la distance au Cœur : la crête avance vers lui.
		var phase: float = _wave_time / period + float(_distance[i]) / wave_length
		var pulse: float = pow(maxf(0.0, sin(TAU * phase)), 4.0)
		_view.set_bubble_color(cell, _main.lightened(strength * pulse))


func _draw() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var radius: float = _view.bubble_radius()
	var tint: Color = _main
	tint.a = affordable_alpha
	for cell: int in _colonizable:
		var center: Vector2 = _view.cell_center(cell)
		if _affordable.has(cell):
			draw_circle(center, radius, tint)
		draw_arc(center, radius - outline_width * 0.5, 0.0, TAU, 32, _main, outline_width, true)
	for i: int in range(colony.queue.size()):
		_draw_queued(colony.queue[i], i + 1, radius)
	for cell: int in colony.growing:
		_draw_growing(state, cell, radius)
	_draw_heart(colony.heart, radius)
	if _hover >= 0:
		var hover_color: Color = Settings.palette().text
		hover_color.a = 0.6
		draw_arc(_view.cell_center(_hover), radius + 4.0, 0.0, TAU, 32, hover_color, 2.0, true)


func _draw_queued(cell: int, number: int, radius: float) -> void:
	var center: Vector2 = _view.cell_center(cell)
	draw_arc(center, radius - outline_width * 0.5, 0.0, TAU, 32, _dark, outline_width, true)
	var size: int = roundi(radius * 1.1)
	var width: float = radius * 2.0
	var baseline: Vector2 = center + Vector2(-radius, size * 0.36)
	draw_string(_font, baseline, str(number), HORIZONTAL_ALIGNMENT_CENTER, width, size, _dark)


## Case en pousse : cercle pointillé et jauge qui se remplit pendant la pousse.
func _draw_growing(state: GameState, cell: int, radius: float) -> void:
	var center: Vector2 = _view.cell_center(cell)
	var dashes: int = 12
	for dash: int in range(dashes):
		var start: float = TAU * dash / dashes
		draw_arc(center, radius, start, start + TAU / dashes * 0.55, 6, _dark, 2.0, true)
	var total: float = float(Expansion.growth_ticks(state, cell))
	var done: float = total - float(state.growth_left[cell]) + _session.tick_fraction()
	var progress: float = clampf(done / total, 0.0, 1.0)
	var fill: Color = _main
	fill.a = 0.55
	draw_circle(center, radius * (0.25 + 0.6 * progress), fill)
	var gauge_radius: float = radius - gauge_width * 0.5 - 2.0
	draw_arc(
		center, gauge_radius, -PI / 2.0, -PI / 2.0 + TAU * progress, 32, _dark, gauge_width, true
	)


## Le Cœur : une pastille foncée, qui saute quand un palier tombe.
func _draw_heart(cell: int, radius: float) -> void:
	if cell < 0:
		return
	var bounce: float = 0.0
	if _jump_left > 0.0:
		var t: float = 1.0 - _jump_left / heart_jump_time
		bounce = sin(t * PI) * (1.0 - t) * heart_jump_scale * 2.0
	var center: Vector2 = _view.cell_center(cell) - Vector2(0.0, radius * bounce)
	draw_circle(center, radius * (1.0 + bounce * 0.3), _dark)


## Distance au Cœur, par le réseau, de chaque case de _owned (même ordre).
func _network_distances(state: GameState, colony: ColonyState) -> PackedInt32Array:
	var by_cell: Dictionary[int, int] = {}
	if colony.heart >= 0 and state.connected[colony.heart] == 1:
		by_cell[colony.heart] = 0
		var frontier := PackedInt32Array([colony.heart])
		var next: int = 0
		while next < frontier.size():
			var cell: int = frontier[next]
			next += 1
			for direction: int in range(6):
				var other: int = state.map.neighbor_index(cell, direction)
				if other >= 0 and not by_cell.has(other) and state.is_owned_by(other, colony.id):
					by_cell[other] = by_cell[cell] + 1
					frontier.append(other)
	var result := PackedInt32Array()
	for cell: int in _owned:
		var distance: int = by_cell.get(cell, 0)
		result.append(distance)
	return result
