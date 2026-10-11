class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §5 bis.6, §16.5), transformés en commandes :
## - clic gauche sur une case qui n'est pas à moi : pose un point chaud ; sur un de mes points
##   chauds : le retire ;
## - clic droit sur un de mes points chauds : le retire.
## La carte glisse au clic du milieu (MapCamera). La validité est demandée à la simulation : les
## règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)

var _session: Session
var _view: ForestView
var _hover: int = -1


## Prépare les gestes pour une partie.
func setup(session: Session, view: ForestView) -> void:
	_session = session
	_view = view


## Case actuellement survolée (−1 : aucune).
func hovered_cell() -> int:
	return _hover


func _unhandled_input(event: InputEvent) -> void:
	if _session == null:
		return
	if event is InputEventMouseMotion:
		_update_hover()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if not button.pressed:
			return
		if button.button_index == MOUSE_BUTTON_LEFT or button.button_index == MOUSE_BUTTON_RIGHT:
			_update_hover()
			if _hover < 0:
				return
			if button.button_index == MOUSE_BUTTON_LEFT:
				click(_hover)
			else:
				right_click(_hover)
			get_viewport().set_input_as_handled()


## Clic gauche sur une case : pose un point chaud, ou retire celui qui y est.
func click(cell: int) -> void:
	if not _can_order():
		return
	var command := HotspotCommand.new(_view.map().cells[cell], _session.local_colony)
	var code: Refusal.Code = _session.simulation.check(command)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_session.send_command(command)


## Clic droit sur une case : retire mon point chaud s'il y en a un (sinon rien).
func right_click(cell: int) -> void:
	if cell < 0 or not _session.colony().hotspots.has(cell):
		return
	click(cell)


## Texte traduit d'une raison de refus.
static func refusal_text(code: Refusal.Code) -> String:
	var name: String = Refusal.Code.keys()[code]
	return TranslationServer.translate("REFUSAL_%s" % name)


func _can_order() -> bool:
	if _session.accepts_commands():
		return true
	message.emit(blocked_text(_session))
	return false


## Texte traduit de la raison pour laquelle aucun ordre n'est accepté : spectateur, pause ou
## partie terminée.
static func blocked_text(session: Session) -> String:
	if session.is_spectator():
		return TranslationServer.translate("HUD_SPECTATOR_NO_ORDERS")
	if session.is_running():
		return TranslationServer.translate("HUD_PAUSED_NO_ORDERS")
	return refusal_text(Refusal.Code.GAME_OVER)


func _update_hover() -> void:
	var cell: int = _view.cell_at(_view.get_global_mouse_position())
	if cell != _hover:
		_hover = cell
		hovered.emit(cell)
