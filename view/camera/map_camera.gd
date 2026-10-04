class_name MapCamera
extends Camera2D
## Caméra de la carte (GDD §13.4) :
## - déplacement en maintenant le clic droit, ou en approchant la souris des bords de l'écran ;
## - zoom à la molette, centré sur la position de la souris.
## Le clic gauche n'est pas utilisé : il est réservé au jeu.

## Distance au bord de l'écran, en pixels, à partir de laquelle la caméra glisse.
@export var edge_margin: float = 12.0
## Vitesse de glissement par les bords, en pixels d'écran par seconde.
@export var edge_speed: float = 900.0
## Facteur de zoom appliqué à chaque cran de molette.
@export var zoom_step: float = 1.15
## Zoom le plus proche autorisé.
@export var max_zoom: float = 3.0
## Zoom le plus éloigné autorisé, en fraction du zoom qui montre toute la forêt.
@export var min_zoom_fit_ratio: float = 0.8
## Part de l'écran occupée par la forêt quand on la montre en entier.
@export var fit_margin: float = 0.9

var _bounds: Rect2 = Rect2()
var _min_zoom: float = 0.1
var _dragging: bool = false


## Cadre la caméra sur une zone de la carte et la limite à cette zone.
func frame(bounds: Rect2) -> void:
	_bounds = bounds
	var screen: Vector2 = get_viewport_rect().size
	var fit: float = 1.0
	if bounds.size.x > 0.0 and bounds.size.y > 0.0:
		fit = minf(screen.x / bounds.size.x, screen.y / bounds.size.y) * fit_margin
	_min_zoom = fit * min_zoom_fit_ratio
	zoom = Vector2.ONE * fit
	position = bounds.get_center()


## Centre la caméra sur un point, avec un zoom donné en multiple du zoom qui montre toute la
## forêt (borné par les limites du zoom).
func focus(point: Vector2, fit_factor: float) -> void:
	var fit: float = _min_zoom / min_zoom_fit_ratio
	zoom = Vector2.ONE * clampf(fit * fit_factor, _min_zoom, max_zoom)
	position = point
	_clamp_position()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("camera_zoom_in"):
		_zoom_at(get_viewport().get_mouse_position(), zoom_step)
	elif event.is_action_pressed("camera_zoom_out"):
		_zoom_at(get_viewport().get_mouse_position(), 1.0 / zoom_step)
	elif event.is_action_pressed("camera_drag"):
		_dragging = true
	elif event.is_action_released("camera_drag"):
		_dragging = false
	elif event is InputEventMouseMotion and _dragging:
		var motion := event as InputEventMouseMotion
		position -= motion.relative / zoom.x
		_clamp_position()


func _process(delta: float) -> void:
	if _dragging or not get_window().has_focus():
		return
	var direction: Vector2 = _edge_direction()
	if direction != Vector2.ZERO:
		position += direction.normalized() * edge_speed * delta / zoom.x
		_clamp_position()


## Direction de glissement quand la souris touche un bord de la fenêtre.
func _edge_direction() -> Vector2:
	var screen: Vector2 = get_viewport_rect().size
	var mouse: Vector2 = get_viewport().get_mouse_position()
	if not Rect2(Vector2.ZERO, screen).has_point(mouse):
		return Vector2.ZERO
	var direction := Vector2.ZERO
	if mouse.x < edge_margin:
		direction.x = -1.0
	elif mouse.x > screen.x - edge_margin:
		direction.x = 1.0
	if mouse.y < edge_margin:
		direction.y = -1.0
	elif mouse.y > screen.y - edge_margin:
		direction.y = 1.0
	return direction


## Zoome en gardant immobile le point de la carte situé sous la souris.
func _zoom_at(screen_point: Vector2, factor: float) -> void:
	var half_screen: Vector2 = get_viewport_rect().size * 0.5
	var world_point: Vector2 = position + (screen_point - half_screen) / zoom.x
	var new_zoom: float = clampf(zoom.x * factor, _min_zoom, max_zoom)
	zoom = Vector2.ONE * new_zoom
	position = world_point - (screen_point - half_screen) / new_zoom
	_clamp_position()


## Empêche le centre de l'écran de sortir de la forêt.
func _clamp_position() -> void:
	if _bounds.size == Vector2.ZERO:
		return
	position = position.clamp(_bounds.position, _bounds.end)
