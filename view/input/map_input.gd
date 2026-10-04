class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §5.4, §5.5, §16.5), transformés en commandes :
## - clic gauche sur une case visable : elle devient la cible prioritaire de la Tourelle ;
## - touche de déplacement (D), puis clic sur une de mes cases voisines de la Tourelle : la
##   Tourelle y fait un pas ; Échap ou un clic droit court annule le geste.
## La validité est demandée à la simulation : les règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)
## Le mode déplacement (touche D) a été activé ou quitté.
signal moving_changed(active: bool)

## Déplacement maximal de la souris, en pixels, pour qu'un clic droit soit « court ».
const SHORT_CLICK_DISTANCE: float = 8.0

var _session: Session
var _view: ForestView
var _hover: int = -1
var _moving: bool = false
var _right_press := Vector2.ZERO


## Prépare les gestes pour une partie.
func setup(session: Session, view: ForestView) -> void:
	_session = session
	_view = view


## Case actuellement survolée (−1 : aucune).
func hovered_cell() -> int:
	return _hover


## Vrai si le prochain clic choisit le pas de la Tourelle.
func is_moving() -> bool:
	return _moving


## Active ou quitte le mode déplacement.
func set_moving(active: bool) -> void:
	if active == _moving:
		return
	_moving = active
	moving_changed.emit(active)


func _unhandled_input(event: InputEvent) -> void:
	if _session == null:
		return
	if event.is_action_pressed("move_turret"):
		set_moving(not _moving)
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
		_update_hover()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.button_index == MOUSE_BUTTON_RIGHT:
			_right_button(button)
		elif button.button_index == MOUSE_BUTTON_LEFT and button.pressed:
			_update_hover()
			if _hover >= 0:
				click(_hover)
				get_viewport().set_input_as_handled()


## Un clic droit court (sans faire glisser la carte) quitte le mode déplacement.
func _right_button(button: InputEventMouseButton) -> void:
	if button.pressed:
		_right_press = button.position
	elif button.position.distance_to(_right_press) <= SHORT_CLICK_DISTANCE:
		set_moving(false)


## Clic sur une case : pas de la Tourelle en mode déplacement, sinon cible prioritaire.
func click(cell: int) -> void:
	if not _can_order():
		return
	var target: Vector2i = _view.map().cells[cell]
	var command: Command = TargetCommand.new(target)
	if _moving:
		command = MoveTurretCommand.new(target)
		set_moving(false)
	command.colony_id = _session.local_colony
	var code: Refusal.Code = _session.simulation.check(command)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_session.send_command(command)


## Texte traduit d'une raison de refus.
static func refusal_text(code: Refusal.Code) -> String:
	var name: String = Refusal.Code.keys()[code]
	return TranslationServer.translate("REFUSAL_%s" % name)


func _can_order() -> bool:
	if _session.accepts_commands():
		return true
	if _session.is_running():
		message.emit(TranslationServer.translate("HUD_PAUSED_NO_ORDERS"))
	else:
		message.emit(refusal_text(Refusal.Code.GAME_OVER))
	return false


func _update_hover() -> void:
	var cell: int = _view.cell_at(_view.get_global_mouse_position())
	if cell != _hover:
		_hover = cell
		hovered.emit(cell)
