class_name RankingCard
extends PanelContainer
## Mini-classement (maquette « Écran de partie », en haut à droite de la carte) : une ligne par
## colonie, dans l'ordre du classement (GDD §3.3), avec sa pastille de couleur, son nom, ses
## cases, ses éliminations et sa production moyenne depuis le début.

var _session: Session
var _rows: VBoxContainer
var _main: Array[Color] = []


func _init() -> void:
	theme_type_variation = &"GameCard"
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(315.0, 0.0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 8)
	add_child(column)
	var title: Label = HudStyle.label(&"TinyBoldHintLabel", "HUD_RANKING")
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(title)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override(&"separation", 8)
	column.add_child(_rows)


## Branche le classement sur une partie, avec la couleur principale de chaque colonie.
func setup(session: Session, main: Array[Color]) -> void:
	_session = session
	_main = main
	refresh()


## Recalcule les lignes.
func refresh() -> void:
	for child: Node in _rows.get_children():
		child.queue_free()
	var state: GameState = _session.simulation.state
	for colony_id: int in VictorySystem.ranking(state):
		_rows.add_child(_row(state, state.colonies[colony_id]))


func _row(state: GameState, colony: ColonyState) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 12)
	var dot := ColorRect.new()
	dot.custom_minimum_size = Vector2(18.0, 18.0)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	dot.color = _main[colony.id]
	if not colony.alive:
		dot.color.a = 0.35
	row.add_child(dot)
	var local: bool = colony.id == _session.viewer_colony()
	var name: Label = HudStyle.label(
		&"BoldLabel" if local else &"BodyLabel",
		GameText.colony_name(colony.id, _session.viewer_colony(), _session.colors)
	)
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name)
	if colony.trophies > 0:
		row.add_child(HudStyle.label(&"BodyHintLabel", tr("HUD_KILLS") % colony.trophies))
	row.add_child(HudStyle.label(&"BodyHintLabel", str(colony.cell_count)))
	var average: int = colony.biomass / maxi(1, state.tick)
	row.add_child(HudStyle.label(&"BoldLabel", tr("HUD_RATE_VALUE") % NumberFormat.rate(average)))
	return row
