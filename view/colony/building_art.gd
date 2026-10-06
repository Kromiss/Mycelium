class_name BuildingArt
extends RefCounted
## Dessin d'un bâtiment sur la carte (GDD §5 bis : « un pictogramme simple par type dans une
## pastille à la couleur de la colonie, avec barre de PV » ; l'habillage viendra en G7) :
## - actif : pastille de la couleur de la colonie, cerclée de sa teinte foncée, pictogramme
##   crème ;
## - chantier : pastille atténuée, contour en pointillé et jauge de l'avancement ;
## - endormi (tombé) : pastille grise, et jauge du temps avant le réveil ;
## - barre de PV sous la pastille dès qu'il est blessé (ou en chantier).

## Taille de la pastille, en multiple du rayon d'une bulle.
const SCALE: float = 1.12
## Taille du pictogramme, en multiple du rayon de la pastille.
const ICON_SCALE: float = 1.45
## Opacité d'un bâtiment en chantier.
const SITE_ALPHA: float = 0.6
## Épaisseur du cercle et de la barre de PV, en pixels de carte.
const RING_WIDTH: float = 3.5
const BAR_HEIGHT: float = 5.0


## Dessine un bâtiment centré sur « center ». « radius » : rayon d'une bulle. « health » : part
## des PV (0 à 1) ; « site » : avancement du chantier (1 : fini) ; « sleep » : part du sommeil
## écoulée (−1 : réveillé).
static func draw(
	canvas: CanvasItem,
	center: Vector2,
	radius: float,
	kind: int,
	main: Color,
	dark: Color,
	palette: Palette,
	health: float,
	site: float,
	sleep: float,
) -> void:
	var size: float = radius * SCALE
	var fill: Color = main
	var ring: Color = dark
	var ink: Color = TurretArt.CREAM
	if sleep >= 0.0:
		fill = palette.line
		ring = palette.text_secondary
		ink = palette.text_secondary
	elif site < 1.0:
		fill.a = SITE_ALPHA
	canvas.draw_circle(center, size, fill)
	if site < 1.0 and sleep < 0.0:
		_dashed(canvas, center, size, ring, 16)
		canvas.draw_arc(
			center, size + 4.0, -PI / 2.0, -PI / 2.0 + TAU * site, 40, dark, RING_WIDTH, true
		)
	else:
		canvas.draw_arc(center, size, 0.0, TAU, 40, ring, RING_WIDTH, true)
	if sleep >= 0.0:
		canvas.draw_arc(
			center, size + 4.0, -PI / 2.0, -PI / 2.0 + TAU * sleep, 40, ring, RING_WIDTH, true
		)
	HudIcons.draw_building(canvas, kind, center, size * ICON_SCALE, ink)
	if sleep < 0.0 and (health < 1.0 or site < 1.0):
		var width: float = size * 1.8
		var bar := Rect2(center + Vector2(-width / 2.0, size + 6.0), Vector2(width, BAR_HEIGHT))
		canvas.draw_rect(bar, palette.line)
		var filled := Rect2(bar.position, Vector2(width * clampf(health, 0.0, 1.0), BAR_HEIGHT))
		canvas.draw_rect(filled, dark)


static func _dashed(
	canvas: CanvasItem, center: Vector2, radius: float, color: Color, dashes: int
) -> void:
	for dash: int in range(dashes):
		var start: float = TAU * dash / dashes
		canvas.draw_arc(
			center, radius, start, start + TAU / dashes * 0.5, 6, color, RING_WIDTH, true
		)
