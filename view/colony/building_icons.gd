class_name BuildingIcons
extends RefCounted
## Pictogrammes des bâtiments (GDD §13.2, maquettes validées le 4 octobre 2026) : spirale,
## jarre, pousse, goutte et racines, en trait blanc à teinter, plus leur version pointillée
## (en file ou en construction) et le cadenas des bâtiments désactivés. Sert à la carte et au
## HUD, et sait dessiner un bâtiment dans chacun de ses états.

const ICONS: Dictionary[StringName, Texture2D] = {
	&"digestion_node": preload("res://assets/icons/buildings/digestion_node.svg"),
	&"granary": preload("res://assets/icons/buildings/granary.svg"),
	&"nursery": preload("res://assets/icons/buildings/nursery.svg"),
	&"enzyme_gland": preload("res://assets/icons/buildings/enzyme_gland.svg"),
	&"mycorrhiza": preload("res://assets/icons/buildings/mycorrhiza.svg"),
}
const DASHED: Dictionary[StringName, Texture2D] = {
	&"digestion_node": preload("res://assets/icons/buildings/digestion_node_dashed.svg"),
	&"granary": preload("res://assets/icons/buildings/granary_dashed.svg"),
	&"nursery": preload("res://assets/icons/buildings/nursery_dashed.svg"),
	&"enzyme_gland": preload("res://assets/icons/buildings/enzyme_gland_dashed.svg"),
	&"mycorrhiza": preload("res://assets/icons/buildings/mycorrhiza_dashed.svg"),
}
const LOCK: Texture2D = preload("res://assets/icons/buildings/lock.svg")
## Opacité d'un bâtiment désactivé (GDD §13.2).
const OFF_ALPHA: float = 0.45
## Taille du pictogramme par rapport au rayon du disque.
const ICON_RATIO: float = 1.5


## Pictogramme plein d'un bâtiment (null s'il est inconnu).
static func icon(id: StringName) -> Texture2D:
	return ICONS.get(id, null)


## Pictogramme pointillé d'un bâtiment (null s'il est inconnu).
static func dashed(id: StringName) -> Texture2D:
	return DASHED.get(id, null)


## Bâtiment actif : disque crème cerclé de la teinte foncée, pictogramme foncé.
static func draw_built(
	canvas: CanvasItem,
	id: StringName,
	center: Vector2,
	radius: float,
	dark: Color,
	palette: Palette
) -> void:
	canvas.draw_circle(center, radius, palette.building_disc)
	canvas.draw_arc(center, radius, 0.0, TAU, 40, dark, maxf(1.5, radius * 0.08), true)
	_draw_texture(canvas, icon(id), center, radius, dark)


## Bâtiment désactivé : disque et pictogramme gris à 45 %, cadenas opaque.
static func draw_off(
	canvas: CanvasItem, id: StringName, center: Vector2, radius: float, palette: Palette
) -> void:
	var disc: Color = palette.building_off
	disc.a = OFF_ALPHA
	var ink: Color = palette.building_off_ink
	ink.a = OFF_ALPHA
	canvas.draw_circle(center, radius, disc)
	_draw_texture(canvas, icon(id), center, radius, ink)
	draw_lock(canvas, center + Vector2(radius * 0.62, -radius * 0.62), radius * 0.5, palette)


## Petit cadenas opaque, dans une pastille.
static func draw_lock(canvas: CanvasItem, center: Vector2, radius: float, palette: Palette) -> void:
	canvas.draw_circle(center, radius, palette.card)
	var size := Vector2.ONE * radius * 1.4
	canvas.draw_texture_rect(
		LOCK, Rect2(center - size * 0.5, size), false, palette.building_off_ink.darkened(0.2)
	)


## Bâtiment en file ou en chantier : contour et pictogramme pointillés couleur crème, et, pour
## un chantier, une jauge (0 à 1) de la teinte foncée ; « progress » < 0 : pas de jauge.
static func draw_planned(
	canvas: CanvasItem,
	id: StringName,
	center: Vector2,
	radius: float,
	dark: Color,
	palette: Palette,
	progress: float
) -> void:
	var cream: Color = palette.building_disc
	var dashes: int = 14
	for dash: int in range(dashes):
		var start: float = TAU * dash / dashes
		canvas.draw_arc(
			center, radius * 0.92, start, start + TAU / dashes * 0.55, 6, cream, 2.5, true
		)
	_draw_texture(canvas, dashed(id), center, radius, cream)
	if progress < 0.0:
		return
	var track: Color = cream
	track.a = 0.45
	var width: float = maxf(2.5, radius * 0.16)
	var ring: float = radius + width * 0.5 + 1.0
	canvas.draw_arc(center, ring, 0.0, TAU, 40, track, width, true)
	if progress > 0.0:
		canvas.draw_arc(
			center,
			ring,
			-PI / 2.0,
			-PI / 2.0 + TAU * clampf(progress, 0.0, 1.0),
			40,
			dark,
			width,
			true
		)


static func _draw_texture(
	canvas: CanvasItem, texture: Texture2D, center: Vector2, radius: float, color: Color
) -> void:
	if texture == null:
		return
	var size := Vector2.ONE * radius * ICON_RATIO
	canvas.draw_texture_rect(texture, Rect2(center - size * 0.5, size), false, color)
