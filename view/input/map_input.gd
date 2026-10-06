class_name MapInput
extends Node
## Gestes du joueur sur la carte (GDD §5.4, §5 bis, §11, §16.5), transformés en commandes :
## - clic gauche sur une case visable : elle devient la cible prioritaire de la Tourelle et des
##   bâtiments qui peuvent la frapper ;
## - capacité qui vise une case (Mur, Nuage : touche ou bouton), puis clic sur la case ;
##   la Salve part tout de suite ;
## - clic droit sur une de mes cases : la roue des bâtiments (Démolir sur un de mes
##   bâtiments) ; bouton d'un bâtiment dans le panneau, puis clic sur une de mes cases.
## Échap ou un clic droit annule le geste en cours (et ferme la roue). La carte glisse au clic
## du milieu (MapCamera). La validité est demandée à la simulation : les règles restent dans sim/.

## La case survolée a changé (−1 : aucune).
signal hovered(cell: int)
## Un message est à montrer au joueur (texte déjà traduit).
signal message(text: String)
## Le geste en cours a changé (Mode ; « choice » : rang de la capacité en mode ABILITY, du
## bâtiment en mode BUILD).
signal mode_changed(mode: Mode, choice: int)
## Clic droit : ouvrir la roue des bâtiments sur une de mes cases (−1 : fermer la roue), à la
## position de la souris (pixels d'écran).
signal wheel_requested(cell: int, screen_position: Vector2)

## Ce que fera le prochain clic sur la carte.
enum Mode { TARGET, ABILITY, BUILD }

## Vrai si la roue des bâtiments est ouverte (fourni par l'écran) : un clic gauche sur la carte
## la ferme seulement.
var wheel_open: Callable = Callable()

var _session: Session
var _view: ForestView
var _hover: int = -1
var _mode: Mode = Mode.TARGET
var _ability: int = -1


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


## Rang du bâtiment qui attend sa case (−1 : aucun).
func pending_building() -> int:
	return _ability if _mode == Mode.BUILD else -1


## Bouton d'un bâtiment dans le panneau : le prochain clic sur une de mes cases le pose. Un
## bâtiment qui ne pourrait être posé nulle part (palier, place, Enzymes) affiche la raison.
func start_build(index: int) -> void:
	if not _can_order():
		return
	var state: GameState = _session.simulation.state
	if index < 0 or index >= state.defs.buildings.size():
		return
	if _mode == Mode.BUILD and _ability == index:
		cancel()
		return
	var id: StringName = state.defs.buildings[index].id
	var code: Refusal.Code = _session.simulation.check_building_type(_session.local_colony, id)
	if code != Refusal.Code.OK:
		message.emit(refusal_text(code))
		return
	_set_mode(Mode.BUILD, index)


## Annule le geste en cours (capacité ou bâtiment qui attend sa case). Faux s'il n'y en avait
## pas.
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
	if event is InputEventMouseMotion:
		_update_hover()
	elif event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.button_index == MOUSE_BUTTON_RIGHT and button.pressed:
			_update_hover()
			right_click(_hover, button.position)
			get_viewport().set_input_as_handled()
		elif button.button_index == MOUSE_BUTTON_LEFT and button.pressed:
			if wheel_open.is_valid() and wheel_open.call():
				wheel_requested.emit(-1, button.position)
				get_viewport().set_input_as_handled()
				return
			_update_hover()
			if _hover >= 0:
				click(_hover)
				get_viewport().set_input_as_handled()


## Clic droit : annule le geste en cours ; sinon, sur une de mes cases (hors Sporophore), ouvre
## la roue des bâtiments ; ailleurs, la ferme.
func right_click(cell: int, screen_position: Vector2) -> void:
	if cancel():
		wheel_requested.emit(-1, screen_position)
		return
	var colony: ColonyState = _session.colony()
	var mine: bool = (
		cell >= 0
		and colony.alive
		and _session.simulation.state.owner[cell] == colony.id
		and cell != colony.turret
	)
	if mine and _session.accepts_commands():
		wheel_requested.emit(cell, screen_position)
	else:
		wheel_requested.emit(-1, screen_position)


## Clic sur une case : case d'une capacité, d'un bâtiment ou cible prioritaire selon le geste
## en cours.
func click(cell: int) -> void:
	if not _can_order():
		return
	var target: Vector2i = _view.map().cells[cell]
	var command: Command = TargetCommand.new(target)
	if _mode == Mode.ABILITY:
		var ability: SimAbility = _session.simulation.state.defs.abilities[_ability]
		command = UseAbilityCommand.new(ability.id, target)
	elif _mode == Mode.BUILD:
		var building: SimBuilding = _session.simulation.state.defs.buildings[_ability]
		command = BuildCommand.new(building.id, target)
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
