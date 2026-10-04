class_name BuildingPanel
extends PanelContainer
## Panneau du bâtiment d'une case (GDD §7.4, décidé le 4 octobre 2026) : nom, état, effet, et
## un bouton qui le démolit (ou l'annule s'il est en file ou en chantier), avec le montant rendu.

## Le joueur demande de démolir (ou d'annuler) le bâtiment de la case.
signal demolish_requested(cell: int)

var _session: Session
var _cell: int = -1
var _title: Label
var _info: Label
var _button: Button


func _ready() -> void:
	theme_type_variation = &"HudPanel"
	mouse_filter = Control.MOUSE_FILTER_STOP
	visible = false
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 8)
	add_child(column)
	_title = Label.new()
	column.add_child(_title)
	_info = Label.new()
	_info.theme_type_variation = &"SmallLabel"
	column.add_child(_info)
	_button = Button.new()
	_button.theme_type_variation = &"SmallButton"
	_button.focus_mode = Control.FOCUS_NONE
	_button.pressed.connect(func() -> void: demolish_requested.emit(_cell))
	column.add_child(_button)


## Montre le bâtiment d'une case.
func open(session: Session, cell: int) -> void:
	_session = session
	_cell = cell
	visible = true
	refresh()


func close() -> void:
	_cell = -1
	visible = false


func is_open() -> bool:
	return visible


## Case montrée (−1 si le panneau est fermé).
func cell() -> int:
	return _cell


## Met à jour le panneau ; il se ferme si le bâtiment a disparu.
func refresh() -> void:
	if _session == null or _cell < 0:
		return
	var state: GameState = _session.simulation.state
	if state.building[_cell] < 0 or state.owner[_cell] != _session.local_colony:
		close()
		return
	var lines: PackedStringArray = BuildingText.lines(_session, _cell)
	_title.text = lines[0]
	lines.remove_at(0)
	_info.text = "\n".join(lines)
	var refund: String = NumberFormat.amount(Buildings.refund(state, _cell))
	var built: bool = state.building_state[_cell] == GameState.BuildState.BUILT
	_button.text = tr("HUD_DEMOLISH" if built else "HUD_CANCEL_BUILD") % refund
	_button.disabled = not _session.accepts_commands()
	reset_size()
