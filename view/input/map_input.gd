class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §5.4, §5.5, §11, §16.5), transformés en commandes :
## - clic gauche sur une case visable : elle devient la cible prioritaire de la Tourelle ;
## - touche de déplacement (D), puis clic sur une de mes cases voisines de la Tourelle : la
##   Tourelle y fait un pas ;
## - capacité qui vise une case (Mur, Nuage : touche ou bouton), puis clic sur la case ;
##   la Salve part tout de suite.
## Échap ou un clic droit court annule le geste en cours. La validité est demandée à la
## simulation : les règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)
## Le geste en cours a changé (Mode ; « ability » : rang de la capacité en mode ABILITY).
signal mode_changed(mode: Mode, ability: int)

## Ce que fera le prochain clic sur la carte.
enum Mode { TARGET, MOVE, ABILITY }

## Déplacement maximal de la souris, en pixels, pour qu'un clic droit soit « court ».
const SHORT_CLICK_DISTANCE: float = 8.0

var _session: Session
var _view: ForestView
var _hover: int = -1
var _mode: Mode = Mode.TARGET
var _ability: int = -1
var _right_press := Vector2.ZERO


## Prépare les gestes pour une partie.
func setup(session: Session, view: ForestView) -> void:
	_session = session
	_view = view


## Case actuellement survolée (−1 : aucune).
func hovered_cell() -> int:
	return _hover


## Geste en cours.
func mode() -> Mode:
	return _mode


## Rang de la capacité qui attend sa case (−1 : aucune).
func pending_ability() -> int:
	return _ability if _mode == Mode.ABILITY else -1


## Vrai si le prochain clic choisit le pas de la Tourelle.
func is_moving() -> bool:
	return _mode == Mode.MOVE


## Active ou quitte le mode déplacement.
func set_moving(active: bool) -> void:
	if active:
		_set_mode(Mode.MOVE, -1)
	elif _mode == Mode.MOVE:
		_set_mode(Mode.TARGET, -1)


## Annule le geste en cours (déplacement ou capacité). Faux s'il n'y en avait pas.
func cancel() -> bool:
	if _mode == Mode.TARGET:
		return false
	_set_mode(Mode.TARGET, -1)
	return true


## Lance une capacité (bouton ou touche) : tout de suite pour la Salve, sinon le prochain
## clic sur la carte choisit sa case. Une capacité refusée affiche la raison.
func use_ability(index: int) -> void:
	if not _can_order():
		return
	var state: GameState = _session.simulation.state
	if index < 0 or index >= state.defs.abilities.size():
		return
	if _mode == Mode.ABILITY and _ability == index:
		cancel()
		return
	var ability: SimAbility = state.defs.abilities[index]
	var command := UseAbilityCommand.new(ability.id, Vector2i.ZERO, _session.local_colony)
	var turret: int = _session.colony().turret
	if turret >= 0:
		# La case de la Tourelle sert à vérifier tout sauf la case elle-même.
		command.cell = state.map.cells[turret]
	var code: Refusal.Code = _session.simulation.check(command)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	if ability.kind == AbilityDef.Kind.SALVO:
		_session.send_command(command)
	else:
		_set_mode(Mode.ABILITY, index)


func _unhandled_input(event: InputEvent) -> void:
	if _session == null:
		return
	if event.is_action_pressed("move_turret"):
		set_moving(_mode != Mode.MOVE)
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


## Un clic droit court (sans faire glisser la carte) annule le geste en cours.
func _right_button(button: InputEventMouseButton) -> void:
	if button.pressed:
		_right_press = button.position
	elif button.position.distance_to(_right_press) <= SHORT_CLICK_DISTANCE:
		cancel()


## Clic sur une case : pas de la Tourelle, case d'une capacité ou cible prioritaire selon le
## geste en cours.
func click(cell: int) -> void:
	if not _can_order():
		return
	var target: Vector2i = _view.map().cells[cell]
	var command: Command = TargetCommand.new(target)
	match _mode:
		Mode.MOVE:
			command = MoveTurretCommand.new(target)
		Mode.ABILITY:
			var ability: SimAbility = _session.simulation.state.defs.abilities[_ability]
			command = UseAbilityCommand.new(ability.id, target)
	command.colony_id = _session.local_colony
	var code: Refusal.Code = _session.simulation.check(command)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_session.send_command(command)
	cancel()


## Texte traduit d'une raison de refus.
static func refusal_text(code: Refusal.Code) -> String:
	var name: String = Refusal.Code.keys()[code]
	return TranslationServer.translate("REFUSAL_%s" % name)


func _set_mode(value: Mode, ability: int) -> void:
	if value == _mode and ability == _ability:
		return
	_mode = value
	_ability = ability
	mode_changed.emit(_mode, _ability)


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
