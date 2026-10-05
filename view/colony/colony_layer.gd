class_name ColonyLayer
extends Node2D
## Affichage des colonies sur la carte (maquettes G3, « La Tourelle et les cases ») :
## - case à moi : couleur de la colonie ; blessée, elle pâlit et prend le contour de
##   l'attaquant ; hors de portée de ma Tourelle, elle est atténuée ;
## - case entamée : se remplit de la couleur de l'attaquant, comme une jauge circulaire ;
## - case visée par ma Tourelle : contour plein ; cible désignée au clic : contour pointillé et
##   halo ; case soignée par sa colonie : halo de sa couleur ;
## - Sporophores (trois stades selon le palier), cercle de portée en pointillé, spores en arc,
##   pas en cours (Tourelle fantôme sur la case d'arrivée et secondes restantes).
## Ne fait que lire l'état de la partie.

## Opacité d'une case à moi hors de portée de ma Tourelle (maquette : 55 %).
@export var out_of_range_alpha: float = 0.55
## Épaisseurs des contours, en pixels de carte.
@export var outline_width: float = 4.0
## Rayon d'une spore, en fraction du rayon d'une bulle, et hauteur de son arc.
@export var spore_ratio: float = 0.2
@export var spore_arc: float = 0.35
## Nombre maximal de spores dessinées par tick.
@export var max_spores: int = 80
## Opacité de la Tourelle fantôme d'un pas.
@export var ghost_alpha: float = 0.55

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
## Cases entamées par une autre colonie que la leur : case, attaquant, part des PV perdue
## (en millièmes), calculées à chaque tick.
var _hits := PackedInt32Array()
## Cases soignées par leur colonie (cible de soin) : paires (case, colonie).
var _healed := PackedInt32Array()
## Couleur envoyée à chaque bulle de case possédée (transparent : bulle de case libre).
var _colors := PackedColorArray()
var _colors_palette: Palette


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
			_colors[cell] = Color(0, 0, 0, 0)
	_painted = PackedInt32Array()
	_hits = PackedInt32Array()
	_healed = PackedInt32Array()
	var local: ColonyState = _session.colony()
	# Chiffres de chaque colonie calculés une fois (PV max des cases, couleur pâlie), et portée
	# de ma Tourelle : la boucle sur les cases reste légère.
	var defs: SimDefs = state.defs
	var palette: Palette = Settings.palette()
	var factors := PackedInt64Array()
	var cohesions := PackedInt64Array()
	var pales: Array[Color] = []
	for colony: ColonyState in state.colonies:
		factors.append(ColonyStats.cell_hp_factor(defs, colony))
		cohesions.append(
			Fixed.mul(
				defs.cohesion_hp_pm, ColonyStats.mutation_product(defs, colony, &"cohesion_pm")
			)
		)
		pales.append(HudStyle.pale(_main[colony.id], palette))
	var reach: int = -1
	if local.alive and local.turret >= 0:
		reach = ColonyStats.turret_range(defs, local)
	if _colors.size() != state.cell_count() or palette != _colors_palette:
		# Nouvelle palette : la carte a repeint ses bulles, tout est à renvoyer.
		_colors.resize(state.cell_count())
		_colors.fill(Color(0, 0, 0, 0))
		_colors_palette = palette
	var owners: PackedInt32Array = state.owner
	for cell: int in range(state.cell_count()):
		var owner: int = owners[cell]
		var maximum: int = (
			ColonyStats.free_max_hp(state, cell)
			if owner < 0
			else ColonyStats.cell_max_hp(state, cell, factors[owner], cohesions[owner])
		)
		var missing: int = _missing_pm(state, cell, maximum)
		var hitter: int = state.last_hitter[cell]
		if hitter >= 0 and hitter != owner and missing > 0:
			_hits.append_array(PackedInt32Array([cell, hitter, missing]))
		if owner < 0:
			_colors[cell] = Color(0, 0, 0, 0)
			continue
		_painted.append(cell)
		var color: Color = _main[owner].lerp(pales[owner], float(missing) / 1000.0)
		if owner == local.id and reach >= 0 and state.distance(local.turret, cell) > reach:
			color = _view.base_bubble_color(cell).lerp(color, out_of_range_alpha)
		# La couleur n'est envoyée à l'affichage que si elle a changé.
		if color != _colors[cell]:
			_colors[cell] = color
			_view.set_bubble_color(cell, color)
	for colony: ColonyState in state.colonies:
		for cell: int in Targeting.shot_targets(colony):
			if state.owner[cell] == colony.id:
				_healed.append_array(PackedInt32Array([cell, colony.id]))
	queue_redraw()


## Case survolée par la souris (−1 : aucune).
func set_hover(cell: int) -> void:
	if cell != _hover:
		_hover = cell
		queue_redraw()


func _process(_delta: float) -> void:
	if _session != null:
		queue_redraw()


func _draw() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var radius: float = _view.bubble_radius()
	var palette: Palette = Settings.palette()
	for i: int in range(0, _hits.size(), 3):
		_draw_hit(_hits[i], _hits[i + 1], float(_hits[i + 2]) / 1000.0, state, radius)
	for i: int in range(0, _healed.size(), 2):
		_draw_healed(_healed[i], _healed[i + 1], radius)
	_draw_local(state, radius, palette)
	for colony: ColonyState in state.colonies:
		if colony.alive:
			_draw_turret(state, colony, radius, palette)
	_draw_spores(state, radius)
	if _hover >= 0:
		var hover_color: Color = palette.text
		hover_color.a = 0.6
		draw_arc(_view.cell_center(_hover), radius + 5.0, 0.0, TAU, 32, hover_color, 2.0, true)


## Case entamée : la part des PV perdue se remplit de la couleur de l'attaquant ; une case
## possédée prend aussi le contour de l'attaquant (blessée).
func _draw_hit(cell: int, attacker: int, missing: float, state: GameState, radius: float) -> void:
	var center: Vector2 = _view.cell_center(cell)
	if missing >= 0.02:
		if missing >= 0.99:
			# Disque presque plein : un cercle (un secteur fermé sur lui-même ne se dessine pas).
			draw_circle(center, radius, _main[attacker])
		else:
			draw_colored_polygon(_sector(center, radius, missing), _main[attacker])
	if state.owner[cell] >= 0:
		var inner: float = radius - outline_width * 0.5
		draw_arc(center, inner, 0.0, TAU, 40, _dark[attacker], outline_width, true)


## Case soignée par sa colonie : halo et contour de sa couleur.
func _draw_healed(cell: int, colony_id: int, radius: float) -> void:
	var center: Vector2 = _view.cell_center(cell)
	var halo: Color = _main[colony_id]
	halo.a = 0.45
	draw_arc(center, radius + 5.0, 0.0, TAU, 40, halo, 8.0, true)
	draw_arc(
		center, radius - outline_width * 0.5, 0.0, TAU, 40, _dark[colony_id], outline_width, true
	)


## Ce qui ne concerne que la colonie du joueur : cercle de portée, cibles, pas en cours.
func _draw_local(state: GameState, radius: float, palette: Palette) -> void:
	var colony: ColonyState = _session.colony()
	if colony == null or not colony.alive:
		return
	var dark: Color = _dark[colony.id]
	var center: Vector2 = _view.cell_center(colony.turret)
	var reach: float = (ColonyStats.turret_range(state.defs, colony) + 0.5) * _cell_spacing()
	_draw_dashed_circle(center, reach, dark, 4.0, 72)
	for cell: int in colony.targets:
		var target: Vector2 = _view.cell_center(cell)
		draw_arc(target, radius + 1.0, 0.0, TAU, 40, palette.text, outline_width, true)
	if colony.designated >= 0:
		var target: Vector2 = _view.cell_center(colony.designated)
		draw_arc(
			target, radius + 8.0, 0.0, TAU, 40, HudStyle.pale(_main[colony.id], palette), 8.0, true
		)
		_draw_dashed_circle(target, radius + 1.0, palette.text, outline_width, 14)


## Le Sporophore d'une colonie, avec le halo de ma couleur pour le mien, et la Tourelle
## fantôme d'un pas en cours.
func _draw_turret(state: GameState, colony: ColonyState, radius: float, palette: Palette) -> void:
	var stage: int = TurretArt.stage_for(colony.tier)
	var size: float = radius * TurretArt.STAGE_SCALES[stage]
	var center: Vector2 = _view.cell_center(colony.turret)
	var local: bool = colony == _session.colony()
	if local:
		var halo: Color = _main[colony.id]
		halo.a = 0.35
		draw_circle(center, size + 9.0, halo)
	var maximum: int = ColonyStats.turret_max_hp(state.defs, colony)
	var health: float = clampf(float(colony.turret_hp) / float(maxi(1, maximum)), 0.0, 1.0)
	var main: Color = _main[colony.id]
	TurretArt.draw(self, center, size, stage, _dark[colony.id], main, TurretArt.INK)
	if health < 1.0:
		var ring: float = size + 4.0
		draw_arc(center, ring, -PI / 2.0, -PI / 2.0 + TAU * health, 40, main, 5.0, true)
	if colony.is_moving():
		var target: Vector2 = _view.cell_center(colony.move_to)
		_draw_dashed_circle(center, size + 6.0, _dark[colony.id], 3.0, 14)
		TurretArt.draw(
			self, target, size, stage, _dark[colony.id], main, TurretArt.INK, ghost_alpha
		)
		if local:
			_draw_chip(
				target + Vector2(0.0, size + 26.0), tr("MAP_STEP") % colony.move_left, palette
			)


## Petite étiquette arrondie (pas en cours).
func _draw_chip(center: Vector2, text: String, palette: Palette) -> void:
	var font: Font = ThemeFactory.bold_font()
	var size: int = 22
	var width: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x + 28.0
	var rect := Rect2(center - Vector2(width * 0.5, 18.0), Vector2(width, 36.0))
	var box: StyleBoxFlat = HudStyle.pill(palette.card, _dark[_session.local_colony], 3)
	draw_style_box(box, rect)
	var baseline: Vector2 = Vector2(rect.position.x, center.y + size * 0.36)
	draw_string(
		font, baseline, text, HORIZONTAL_ALIGNMENT_CENTER, width, size, _dark[_session.local_colony]
	)


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
		draw_circle(point, radius * spore_ratio * (0.7 + 0.5 * progress), _dark[colony.id])


## Part des PV max perdue par la case, en millièmes (0 : pleine vie).
func _missing_pm(state: GameState, cell: int, maximum: int) -> int:
	if state.is_turret_cell(cell):
		return 0
	return clampi(1000 - Fixed.div_round(state.hp[cell] * 1000, maxi(1, maximum)), 0, 1000)


## Secteur de disque (jauge circulaire) depuis le haut, sur la fraction « part » du tour.
func _sector(center: Vector2, radius: float, part: float) -> PackedVector2Array:
	var points := PackedVector2Array([center])
	var steps: int = maxi(2, ceili(32.0 * part))
	for i: int in range(steps + 1):
		var angle: float = -PI / 2.0 + TAU * part * float(i) / float(steps)
		points.append(center + Vector2(cos(angle), sin(angle)) * radius)
	return points


## Distance entre les centres de deux cases voisines, en pixels de carte.
func _cell_spacing() -> float:
	return sqrt(3.0) * _view.hex_size


func _draw_dashed_circle(
	center: Vector2, radius: float, color: Color, width: float, dashes: int
) -> void:
	for dash: int in range(dashes):
		var start: float = TAU * dash / dashes
		draw_arc(center, radius, start, start + TAU / dashes * 0.5, 6, color, width, true)
