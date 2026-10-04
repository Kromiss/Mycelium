class_name ColonyLayer
extends Node2D
## Affichage provisoire des colonies (G3, étape 1 : le vrai écran arrive à l'étape 2) : cases
## colorées une par une, qui pâlissent quand elles sont blessées ; case libre entamée qui se
## remplit de la couleur de l'attaquant ; Tourelle dans la teinte foncée ; cercle de portée,
## cibles et spores en vol de la colonie du joueur. Ne fait que lire l'état de la partie.

## Pâleur d'une case à 0 PV (fraction du chemin vers la couleur d'une case libre).
@export var wounded_fade: float = 0.65
## Épaisseurs des contours, en pixels de carte.
@export var outline_width: float = 3.0
@export var gauge_width: float = 6.0
## Rayon d'une spore, en fraction du rayon d'une bulle, et hauteur de son arc.
@export var spore_ratio: float = 0.18
@export var spore_arc: float = 0.35
## Nombre maximal de spores dessinées par tick.
@export var max_spores: int = 60

var _view: ForestView
var _session: Session
## Couleurs de chaque colonie (principale et foncée), par numéro de colonie.
var _main: Array[Color] = []
var _dark: Array[Color] = []
var _hover: int = -1
## Spores du dernier tick : paires (colonie, case touchée).
var _spores := PackedInt32Array()
## Cases dont la bulle est peinte d'une couleur de colonie.
var _painted := PackedInt32Array()


## Prépare l'affichage pour une partie et les couleurs de ses colonies.
func setup(view: ForestView, session: Session, main: Array[Color], dark: Array[Color]) -> void:
	_view = view
	_session = session
	_main = main
	_dark = dark
	refresh()


## Recalcule ce qui dépend de l'état (à appeler après chaque tick).
func refresh(result: TickResult = null) -> void:
	if _session == null:
		return
	if result != null:
		_spores = result.shots.slice(0, max_spores * 2)
	var state: GameState = _session.simulation.state
	for cell: int in _painted:
		if state.owner[cell] < 0:
			_view.reset_bubble_color(cell)
	_painted = PackedInt32Array()
	for cell: int in range(state.cell_count()):
		var holder: ColonyState = state.owner_of(cell)
		if holder == null:
			continue
		_painted.append(cell)
		if holder.turret == cell:
			_view.set_bubble_color(cell, _dark[holder.id])
			continue
		var missing: float = 1.0 - _health(state, cell)
		var color: Color = _main[holder.id].lerp(
			_view.base_bubble_color(cell), missing * wounded_fade
		)
		_view.set_bubble_color(cell, color)
	queue_redraw()


## Case survolée par la souris (−1 : aucune).
func set_hover(cell: int) -> void:
	if cell != _hover:
		_hover = cell
		queue_redraw()


func _process(_delta: float) -> void:
	if _session != null and not _spores.is_empty():
		queue_redraw()


func _draw() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var radius: float = _view.bubble_radius()
	for cell: int in range(state.cell_count()):
		if state.last_hitter[cell] >= 0 and not state.is_turret_cell(cell):
			_draw_hit(state, cell, radius)
	_draw_local(state, radius)
	for colony: ColonyState in state.colonies:
		if colony.alive:
			_draw_turret(colony, radius)
	_draw_spores(state, radius)
	if _hover >= 0:
		var hover_color: Color = Settings.palette().text
		hover_color.a = 0.6
		draw_arc(_view.cell_center(_hover), radius + 4.0, 0.0, TAU, 32, hover_color, 2.0, true)


## Case entamée : jauge circulaire de la couleur de l'attaquant (case libre) ou contour de
## l'attaquant (case blessée d'une colonie).
func _draw_hit(state: GameState, cell: int, radius: float) -> void:
	var center: Vector2 = _view.cell_center(cell)
	var attacker: Color = _main[state.last_hitter[cell]]
	if state.owner[cell] >= 0:
		draw_arc(center, radius - outline_width * 0.5, 0.0, TAU, 32, attacker, outline_width, true)
		return
	var progress: float = 1.0 - _health(state, cell)
	var gauge: float = radius - gauge_width * 0.5
	draw_arc(center, gauge, -PI / 2.0, -PI / 2.0 + TAU * progress, 32, attacker, gauge_width, true)


## Ce qui ne concerne que la colonie du joueur : cercle de portée et cibles.
func _draw_local(state: GameState, radius: float) -> void:
	var colony: ColonyState = _session.colony()
	if colony == null or not colony.alive:
		return
	var dark: Color = _dark[colony.id]
	var center: Vector2 = _view.cell_center(colony.turret)
	var reach: float = (ColonyStats.turret_range(state.defs, colony) + 0.5) * _cell_spacing()
	_draw_dotted_circle(center, reach, dark, 2.0, 72)
	for cell: int in colony.targets:
		draw_arc(_view.cell_center(cell), radius + 2.0, 0.0, TAU, 32, dark, outline_width, true)
	if colony.designated >= 0:
		var target: Vector2 = _view.cell_center(colony.designated)
		var halo: Color = _main[colony.id]
		halo.a = 0.35
		draw_circle(target, radius + 7.0, halo)
		_draw_dotted_circle(target, radius + 3.0, dark, outline_width, 14)
	if colony.is_moving():
		_draw_dotted_circle(center, radius + 4.0, dark, 2.0, 14)
		draw_line(center, _view.cell_center(colony.move_to), dark, 2.0, true)


## La Tourelle : un disque foncé avec deux yeux, et sa jauge de PV si elle est blessée.
func _draw_turret(colony: ColonyState, radius: float) -> void:
	var center: Vector2 = _view.cell_center(colony.turret)
	var dark: Color = _dark[colony.id]
	draw_circle(center, radius * 1.05, dark)
	var eye: float = radius * 0.16
	for side: float in [-1.0, 1.0]:
		var eye_center: Vector2 = center + Vector2(side * radius * 0.32, -radius * 0.08)
		draw_circle(eye_center, eye, Settings.palette().card)
	var state: GameState = _session.simulation.state
	var health: float = (
		float(colony.turret_hp) / float(ColonyStats.turret_max_hp(state.defs, colony))
	)
	if health < 1.0:
		var ring: float = radius * 1.05 + 4.0
		draw_arc(center, ring, -PI / 2.0, -PI / 2.0 + TAU * health, 32, _main[colony.id], 4.0, true)


## Spores du dernier tick, en arc de la Tourelle à la case touchée pendant le tick suivant.
func _draw_spores(state: GameState, radius: float) -> void:
	var progress: float = _session.tick_fraction()
	for i: int in range(0, _spores.size(), 2):
		var colony: ColonyState = state.colony(_spores[i])
		if colony == null or colony.turret < 0:
			continue
		var start: Vector2 = _view.cell_center(colony.turret)
		var finish: Vector2 = _view.cell_center(_spores[i + 1])
		var lift: Vector2 = Vector2(0.0, -start.distance_to(finish) * spore_arc)
		var point: Vector2 = start.lerp(finish, progress) + lift * sin(progress * PI)
		draw_circle(point, radius * spore_ratio, _dark[colony.id])


## Part des PV max qu'il reste à la case (0 à 1).
func _health(state: GameState, cell: int) -> float:
	var maximum: int = ColonyStats.cell_max_hp(state, cell)
	return clampf(float(state.hp[cell]) / float(maxi(1, maximum)), 0.0, 1.0)


## Distance entre les centres de deux cases voisines, en pixels de carte.
func _cell_spacing() -> float:
	return sqrt(3.0) * _view.hex_size


func _draw_dotted_circle(
	center: Vector2, radius: float, color: Color, width: float, dashes: int
) -> void:
	for dash: int in range(dashes):
		var start: float = TAU * dash / dashes
		draw_arc(center, radius, start, start + TAU / dashes * 0.5, 6, color, width, true)
