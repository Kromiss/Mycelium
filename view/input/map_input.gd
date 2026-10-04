class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §13.4), transformés en commandes :
## - clic gauche sur une case libre collée au réseau : la pousse démarre tout de suite ;
## - touche de file (Maj) + clic : ajoute la case à la file, ou l'en retire si elle y est ;
## - touche de file + clic glissé : ajoute les cases dans l'ordre du tracé, et s'arrête à la
##   première qui ne peut pas entrer (message) ; repasser sur une case en file ne change rien.
## - en mode palette (bâtiment choisi), clic : pose le bâtiment ; Échap ou clic droit court :
##   quitte le mode palette (GDD §7.4) ;
## - clic sur une case de la colonie : panneau du bâtiment s'il y en a un, sinon menu rond.
## La validité est demandée à la simulation : les règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)
## Le bâtiment choisi dans la palette a changé (vide : plus de mode palette).
signal placing_changed(building: StringName)
## Clic sur une case de la colonie qui a un bâtiment.
signal building_clicked(cell: int)
## Clic sur une case libre de la colonie : le menu rond doit s'ouvrir.
signal build_menu_requested(cell: int)
## Clic sur la carte alors qu'un menu ou un panneau est ouvert : il doit se fermer.
signal dismissed

## Déplacement maximal de la souris, en pixels, pour qu'un clic droit soit « court ».
const SHORT_CLICK_DISTANCE: float = 8.0

## Vrai si le menu rond ou le panneau d'un bâtiment est ouvert (un clic sur la carte le ferme).
var menu_open: bool = false

var _session: Session
var _view: ForestView
var _hover: int = -1
var _dragging: bool = false
var _last_drag_cell: int = -1
## Cases dont l'ajout à la file est envoyé mais pas encore joué (prochain tick).
var _pending: Array[Vector2i] = []
## Cases où une pose est envoyée mais pas encore jouée.
var _pending_builds: Array[Vector2i] = []
var _placing: StringName = &""
var _right_press := Vector2.ZERO


## Prépare les gestes pour une partie.
func setup(session: Session, view: ForestView) -> void:
	_session = session
	_view = view
	_session.ticked.connect(_on_ticked)


## Case actuellement survolée (−1 : aucune).
func hovered_cell() -> int:
	return _hover


## Bâtiment choisi dans la palette (vide : pas de mode palette).
func placing() -> StringName:
	return _placing


## Choisit un bâtiment de la palette (vide : quitte le mode palette).
func set_placing(building: StringName) -> void:
	if building == _placing:
		return
	_placing = building
	placing_changed.emit(building)


## Choisit un bâtiment de la palette, ou quitte le mode palette s'il est déjà choisi. Un
## bâtiment pas encore débloqué est refusé (message).
func toggle_placing(building: StringName) -> void:
	if building == _placing:
		set_placing(&"")
		return
	var state: GameState = _session.simulation.state
	var type: int = state.defs.building_index(building)
	if type < 0:
		return
	if not Buildings.is_unlocked(state, _session.colony(), type):
		message.emit(refusal_text(Refusal.Code.TIER_LOCKED))
		return
	set_placing(building)


## Pose un bâtiment sur une case (palette ou menu rond). Faux si la pose est refusée.
func build(cell: int, building: StringName) -> bool:
	if not _can_order():
		return false
	var target: Vector2i = _cell(cell)
	if _pending_builds.has(target):
		return false
	var code: Refusal.Code = _session.simulation.check_build(
		_session.local_colony, target, building
	)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return false
	if _session.send_command(BuildCommand.new(target, building)):
		_pending_builds.append(target)
	return true


## Démolit le bâtiment d'une case, ou l'annule s'il est en file ou en chantier.
func demolish(cell: int) -> void:
	if not _can_order():
		return
	var target: Vector2i = _cell(cell)
	var code: Refusal.Code = _session.simulation.check_demolish(_session.local_colony, target)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_session.send_command(DemolishCommand.new(target))


func _unhandled_input(event: InputEvent) -> void:
	if _session == null:
		return
	if event is InputEventMouseMotion:
		_update_hover()
		if _dragging and _hover >= 0 and _hover != _last_drag_cell:
			_last_drag_cell = _hover
			drag_over(_hover)
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.button_index == MOUSE_BUTTON_RIGHT:
			_right_button(button)
			return
		if button.button_index != MOUSE_BUTTON_LEFT:
			return
		if not button.pressed:
			_dragging = false
			return
		_update_hover()
		if menu_open:
			dismissed.emit()
			get_viewport().set_input_as_handled()
			return
		if _hover < 0:
			return
		if _placing != &"":
			build(_hover, _placing)
		elif Input.is_action_pressed("queue_modifier"):
			queue_click(_hover)
		else:
			click(_hover)
		get_viewport().set_input_as_handled()


## Un clic droit court (sans faire glisser la carte) quitte le mode palette et ferme les menus.
func _right_button(button: InputEventMouseButton) -> void:
	if button.pressed:
		_right_press = button.position
		return
	if button.position.distance_to(_right_press) > SHORT_CLICK_DISTANCE:
		return
	if menu_open:
		dismissed.emit()
	set_placing(&"")


## Clic simple sur une case : panneau du bâtiment ou menu rond sur une case de la colonie,
## sinon lance la pousse de la case.
func click(cell: int) -> void:
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	if state.is_owned_by(cell, colony.id):
		if state.building[cell] >= 0:
			building_clicked.emit(cell)
		elif cell != colony.heart and _can_order():
			build_menu_requested.emit(cell)
		return
	if not _can_order():
		return
	var target: Vector2i = _cell(cell)
	var code: Refusal.Code = _session.simulation.check_colonize(_session.local_colony, target)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_session.send_command(ColonizeCommand.new(target))


## Clic avec la touche de file : retire la case si elle est en file, sinon l'ajoute et commence
## un tracé.
func queue_click(cell: int) -> void:
	if not _can_order():
		return
	var target: Vector2i = _cell(cell)
	if _session.colony().queue.has(cell):
		_session.send_command(DequeueCommand.new(target))
		return
	if _pending.has(target):
		return
	if _try_enqueue(target):
		_dragging = true
		_last_drag_cell = cell


## Le tracé passe sur une nouvelle case.
func drag_over(cell: int) -> void:
	if not _dragging or not _can_order():
		_dragging = false
		return
	var target: Vector2i = _cell(cell)
	if _session.colony().queue.has(cell) or _pending.has(target):
		return
	if not _try_enqueue(target):
		_dragging = false


## Texte traduit d'une raison de refus.
static func refusal_text(code: Refusal.Code) -> String:
	var name: String = Refusal.Code.keys()[code]
	return TranslationServer.translate("REFUSAL_%s" % name)


func _try_enqueue(target: Vector2i) -> bool:
	var code: Refusal.Code = _session.simulation.check_enqueue(
		_session.local_colony, target, _pending
	)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return false
	if _session.send_command(EnqueueCommand.new(target)):
		_pending.append(target)
	return true


func _can_order() -> bool:
	if _session.accepts_commands():
		return true
	if _session.is_replay():
		return false
	if _session.is_running():
		message.emit(TranslationServer.translate("HUD_PAUSED_NO_ORDERS"))
	else:
		message.emit(refusal_text(Refusal.Code.GAME_OVER))
	return false


func _cell(index: int) -> Vector2i:
	return _view.map().cells[index]


func _update_hover() -> void:
	var cell: int = _view.cell_at(_view.get_global_mouse_position())
	if cell != _hover:
		_hover = cell
		hovered.emit(cell)


func _on_ticked(_result: TickResult) -> void:
	_pending.clear()
	_pending_builds.clear()
