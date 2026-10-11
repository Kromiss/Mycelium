class_name PropagationCard
extends PanelContainer
## Carte « Propagation » du panneau (GDD §16.2, 11 octobre 2026) : PV du Sporophore et leur
## barre, poussée par case de bordure, force utilisée par rapport au plafond (barre), nombre de
## cases de bordure et points chauds posés.

var _session: Session
var _hp: Label
var _hp_bar: ProgressBar
var _force_bar: ProgressBar
var _stats: Array[Label] = []


func _init() -> void:
	theme_type_variation = &"GameCard"
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 9)
	add_child(column)
	var top := HBoxContainer.new()
	column.add_child(top)
	var title: Label = HudStyle.label(&"CardTitleLabel", "HUD_PROPAGATION_TITLE")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	_hp = HudStyle.label(&"BodyHintLabel")
	top.add_child(_hp)
	_hp_bar = ProgressBar.new()
	column.add_child(_hp_bar)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override(&"h_separation", 9)
	column.add_child(grid)
	for key: String in ["HUD_STAT_PUSH", "HUD_STAT_FORCE", "HUD_STAT_BORDER", "HUD_STAT_HOTSPOTS"]:
		var cell := VBoxContainer.new()
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.add_theme_constant_override(&"separation", 0)
		cell.add_child(HudStyle.label(&"TinyHintLabel", key))
		var value: Label = HudStyle.label(&"StatLabel")
		cell.add_child(value)
		_stats.append(value)
		grid.add_child(cell)
	_force_bar = ProgressBar.new()
	column.add_child(_force_bar)


## Branche la carte sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	HudStyle.paint_bar(_hp_bar, dark, Settings.palette())
	HudStyle.paint_bar(_force_bar, main, Settings.palette())
	refresh()


## Texte d'une statistique (pour les tests) : 0 poussée, 1 force, 2 bordure, 3 points chauds.
func stat_text(index: int) -> String:
	return _stats[index].text


## Met à jour les chiffres.
func refresh() -> void:
	var simulation: Simulation = _session.simulation
	var colony: ColonyState = _session.colony()
	var maximum: int = ColonyStats.turret_max_hp(simulation.state.defs, colony)
	_hp.text = (
		tr("HUD_TURRET_HP") % [NumberFormat.amount(colony.turret_hp), NumberFormat.amount(maximum)]
	)
	_hp_bar.value = clampf(float(colony.turret_hp) / float(maxi(1, maximum)), 0.0, 1.0)
	var push: PackedInt64Array = simulation.push_values(colony.id)
	_stats[0].text = tr("HUD_PER_SECOND_VALUE") % NumberFormat.amount(push[0])
	_stats[1].text = (
		tr("HUD_FRACTION_VALUE")
		% [NumberFormat.amount(colony.push_force), NumberFormat.amount(push[1])]
	)
	_stats[2].text = str(colony.border_cells)
	_stats[3].text = (
		tr("HUD_FRACTION_VALUE") % [colony.hotspots.size(), simulation.max_hotspots(colony.id)]
	)
	_force_bar.value = clampf(float(colony.push_force) / float(maxi(1, push[1])), 0.0, 1.0)
