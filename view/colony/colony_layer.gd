class_name ColonyLayer
extends Node2D
## Affichage des colonies sur la carte (maquettes G3 ; propagation, GDD §5 bis.7) :
## - case à moi : couleur de la colonie ; blessée, elle pâlit et prend le contour de
##   l'attaquant ;
## - case entamée : se remplit de la couleur de l'attaquant, comme une jauge circulaire ;
## - cases de bordure : un anneau de la couleur de leur colonie qui pulse doucement ;
## - mes points chauds : marqueur numéroté de ma couleur, relié par un trait léger à ma case de
##   bordure la plus proche ;
## - Sporophores (trois stades selon le palier).
## Ne fait que lire l'état de la partie.

## Épaisseurs des contours, en pixels de carte.
@export var outline_width: float = 4.0
## Durée d'une pulsation de la bordure, en secondes, et opacité la plus forte de son anneau.
@export var pulse_period: float = 1.6
@export var pulse_alpha: float = 0.55
## Taille du marqueur d'un point chaud, en fraction du rayon d'une bulle.
@export var hotspot_ratio: float = 0.62

var _view: ForestView
var _session: Session
## Couleurs de chaque colonie (principale et foncée), par numéro de colonie.
var _main: Array[Color] = []
var _dark: Array[Color] = []
var _hover: int = -1
## Cases dont la bulle est peinte d'une couleur de colonie.
var _painted := PackedInt32Array()
## Cases entamées par une autre colonie que la leur : case, attaquant, part des PV perdue
## (en millièmes), calculées à chaque tick.
var _hits := PackedInt32Array()
## Cases de bordure : paires (case, colonie), calculées à chaque tick.
var _borders := PackedInt32Array()
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
func refresh(_result: TickResult = null) -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	for cell: int in _painted:
		if state.owner[cell] < 0:
			_view.reset_bubble_color(cell)
			_colors[cell] = Color(0, 0, 0, 0)
	_painted = PackedInt32Array()
	_hits = PackedInt32Array()
	_borders = PackedInt32Array()
	# Chiffres de chaque colonie calculés une fois (PV max des cases, couleur pâlie) : la boucle
	# sur les cases reste légère.
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
		if state.touches_other(cell, owner):
			_borders.append_array(PackedInt32Array([cell, owner]))
		var color: Color = _main[owner].lerp(pales[owner], float(missing) / 1000.0)
		# La couleur n'est envoyée à l'affichage que si elle a changé.
		if color != _colors[cell]:
			_colors[cell] = color
			_view.set_bubble_color(cell, color)
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
	_draw_borders(radius)
	for colony: ColonyState in state.colonies:
		if colony.alive:
			_draw_turret(state, colony, radius)
	_draw_hotspots(state, radius, palette)
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


## Cases de bordure : un anneau de la couleur de leur colonie qui pulse doucement.
func _draw_borders(radius: float) -> void:
	var phase: float = fmod(float(Time.get_ticks_msec()) / 1000.0, pulse_period) / pulse_period
	var alpha: float = pulse_alpha * (0.5 + 0.5 * sin(phase * TAU))
	for i: int in range(0, _borders.size(), 2):
		var color: Color = _main[_borders[i + 1]]
		color.a = alpha
		draw_arc(_view.cell_center(_borders[i]), radius + 2.0, 0.0, TAU, 32, color, 3.0, true)


## Mes points chauds : marqueur numéroté (1 = le plus ancien), relié par un trait léger à ma case
## de bordure la plus proche.
func _draw_hotspots(state: GameState, radius: float, palette: Palette) -> void:
	var colony: ColonyState = _session.colony()
	if colony == null or not colony.alive:
		return
	var font: Font = ThemeDB.fallback_font
	var size: float = radius * hotspot_ratio
	var line: Color = _dark[colony.id]
	line.a = 0.5
	for index: int in range(colony.hotspots.size()):
		var cell: int = colony.hotspots[index]
		var center: Vector2 = _view.cell_center(cell)
		var nearest: int = _nearest_border(state, colony.id, cell)
		if nearest >= 0:
			draw_dashed_line(_view.cell_center(nearest), center, line, 2.0, 8.0, true)
		draw_circle(center, size + 3.0, palette.card)
		draw_circle(center, size, _dark[colony.id])
		var text: String = str(index + 1)
		var font_size: int = int(size * 1.3)
		var width: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var baseline: Vector2 = center + Vector2(-width * 0.5, font_size * 0.35)
		draw_string(font, baseline, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color.WHITE)


## Ma case de bordure la plus proche d'une case (−1 : aucune).
func _nearest_border(state: GameState, colony_id: int, cell: int) -> int:
	var best: int = -1
	var best_distance: int = 0
	for i: int in range(0, _borders.size(), 2):
		if _borders[i + 1] != colony_id:
			continue
		var distance: int = state.distance(_borders[i], cell)
		if best < 0 or distance < best_distance:
			best = _borders[i]
			best_distance = distance
	return best


## Le Sporophore d'une colonie, avec le halo de ma couleur pour le mien.
func _draw_turret(state: GameState, colony: ColonyState, radius: float) -> void:
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
