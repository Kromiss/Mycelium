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


## Met les lignes à jour, dans l'ordre du classement (les lignes sont créées une fois, puis
## seulement remplies).
func refresh() -> void:
	var state: GameState = _session.simulation.state
	var ranking: PackedInt32Array = VictorySystem.ranking(state)
	while _rows.get_child_count() < ranking.size():
		_rows.add_child(_new_row())
	for position: int in range(ranking.size()):
		_fill_row(_rows.get_child(position) as HBoxContainer, state, ranking[position])


## Ligne vide : pastille, nom, éliminations, cases, production moyenne.
func _new_row() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 12)
	var dot := ColorRect.new()
	dot.custom_minimum_size = Vector2(18.0, 18.0)
	dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(dot)
	var name: Label = HudStyle.label(&"BodyLabel", "")
	name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name)
	row.add_child(HudStyle.label(&"BodyHintLabel", ""))
	row.add_child(HudStyle.label(&"BodyHintLabel", ""))
	row.add_child(HudStyle.label(&"BoldLabel", ""))
	return row


func _fill_row(row: HBoxContainer, state: GameState, colony_id: int) -> void:
	var colony: ColonyState = state.colonies[colony_id]
	var dot: ColorRect = row.get_child(0)
	dot.color = _main[colony.id]
	if not colony.alive:
		dot.color.a = 0.35
	var local: bool = colony.id == _session.viewer_colony()
	var name: Label = row.get_child(1)
	name.theme_type_variation = &"BoldLabel" if local else &"BodyLabel"
	name.text = GameText.colony_name(colony.id, _session.viewer_colony(), _session.colors)
	var kills: Label = row.get_child(2)
	kills.visible = colony.trophies > 0
	kills.text = tr("HUD_KILLS") % colony.trophies
	var cells: Label = row.get_child(3)
	cells.text = str(colony.cell_count)
	@warning_ignore("integer_division")
	var average: int = colony.biomass / maxi(1, state.tick)
	var rate: Label = row.get_child(4)
	rate.text = tr("HUD_RATE_VALUE") % NumberFormat.rate(average)
