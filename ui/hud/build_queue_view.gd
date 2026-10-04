class_name BuildQueueView
extends VBoxContainer
## File de construction dans le HUD (GDD §13.6, décidé le 4 octobre 2026) : nombre de chantiers
## et de places, puis les chantiers (jauge) et les bâtiments en file (numéro) ; un clic annule.

## Le joueur veut annuler le bâtiment d'une case.
signal cancel_requested(cell: int)

var _session: Session
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _label: Label
var _slots: HFlowContainer
## Cases montrées, pour ne recréer les boutons que si la file change.
var _shown := PackedInt32Array()


func _ready() -> void:
	add_theme_constant_override(&"separation", 4)
	_label = Label.new()
	_label.theme_type_variation = &"SmallHintLabel"
	add_child(_label)
	_slots = HFlowContainer.new()
	add_child(_slots)


func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	_main = main
	_dark = dark
	refresh()


## Met à jour après un tick.
func refresh() -> void:
	if _session == null:
		return
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	_label.text = (
		tr("HUD_BUILDS")
		% [
			colony.constructing.size(),
			Buildings.sites(state, colony),
			colony.build_load(),
			state.defs.build_queue_size,
		]
	)
	var cells := PackedInt32Array(colony.constructing)
	cells.append_array(colony.build_queue)
	if cells != _shown:
		_rebuild(cells)
	_update_slots()
	_update_tooltips()


func _process(_delta: float) -> void:
	if _session != null and not _shown.is_empty():
		_update_slots()


func _rebuild(cells: PackedInt32Array) -> void:
	_shown = cells
	for child: Node in _slots.get_children():
		child.queue_free()
	var state: GameState = _session.simulation.state
	for cell: int in cells:
		var slot := BuildSlot.new()
		slot.cell = cell
		slot.building_id = state.defs.buildings[state.building[cell]].id
		slot.main = _main
		slot.dark = _dark
		slot.pressed.connect(func() -> void: cancel_requested.emit(cell))
		_slots.add_child(slot)


func _update_slots() -> void:
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	for child: Node in _slots.get_children():
		var slot: BuildSlot = child as BuildSlot
		if slot == null or slot.is_queued_for_deletion() or state.building[slot.cell] < 0:
			continue
		if state.building_state[slot.cell] == GameState.BuildState.CONSTRUCTING:
			var type: int = state.building[slot.cell]
			var total: float = float(Buildings.build_ticks(state, type))
			var done: float = total - float(state.build_left[slot.cell]) + _session.tick_fraction()
			slot.progress = clampf(done / maxf(1.0, total), 0.0, 1.0)
			slot.number = 0
		else:
			slot.progress = -1.0
			slot.number = colony.build_queue.find(slot.cell) + 1
		slot.queue_redraw()


## Info-bulle de chaque bouton : nom du bâtiment et montant rendu si on l'annule.
func _update_tooltips() -> void:
	var state: GameState = _session.simulation.state
	for child: Node in _slots.get_children():
		var slot: BuildSlot = child as BuildSlot
		if slot == null or slot.is_queued_for_deletion() or state.building[slot.cell] < 0:
			continue
		var refund: String = NumberFormat.amount(Buildings.refund(state, slot.cell))
		slot.tooltip_text = (
			BuildingText.name_of(state.defs.buildings[state.building[slot.cell]])
			+ "\n"
			+ tr("HUD_CANCEL_BUILD") % refund
		)
