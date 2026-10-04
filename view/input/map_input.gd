class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §13.4), transformés en commandes :
## - clic gauche sur une case libre collée au réseau : la pousse démarre tout de suite ;
## - touche de file (Maj) + clic : ajoute la case à la file, ou l'en retire si elle y est ;
## - touche de file + clic glissé : ajoute les cases dans l'ordre du tracé, et s'arrête à la
##   première qui ne peut pas entrer (message) ; repasser sur une case en file ne change rien.
## La validité est demandée à la simulation : les règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)

var _session: Session
var _view: ForestView
var _hover: int = -1
var _dragging: bool = false
var _last_drag_cell: int = -1
## Cases dont l'ajout à la file est envoyé mais pas encore joué (prochain tick).
var _pending: Array[Vector2i] = []


## Prépare les gestes pour une partie.
func setup(session: Session, view: ForestView) -> void:
	_session = session
	_view = view
	_session.ticked.connect(_on_ticked)


## Case actuellement survolée (−1 : aucune).
func hovered_cell() -> int:
	return _hover


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
		if button.button_index != MOUSE_BUTTON_LEFT:
			return
		if not button.pressed:
			_dragging = false
			return
		_update_hover()
		if _hover < 0:
			return
		if Input.is_action_pressed("queue_modifier"):
			queue_click(_hover)
		else:
			click(_hover)
		get_viewport().set_input_as_handled()


## Clic simple sur une case : lance sa pousse.
func click(cell: int) -> void:
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
