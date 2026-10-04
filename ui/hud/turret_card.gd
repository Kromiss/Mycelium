class_name TurretCard
extends PanelContainer
## Carte de la Tourelle (maquette « Écran de partie ») : PV et leur barre, dégâts, cadence,
## portée, spores par tir, et les 4 boutons de priorité de tir (le choisi est plein).

## Le joueur a choisi une priorité de tir (ColonyState.Priority).
signal priority_chosen(priority: int)

## Clés des noms des priorités, dans l'ordre de ColonyState.Priority.
const PRIORITY_KEYS: Array[String] = [
	"PRIORITY_CLOSEST", "PRIORITY_RICHEST", "PRIORITY_HEAL_FIRST", "PRIORITY_ENEMIES_FIRST"
]

var _session: Session
var _hp: Label
var _bar: ProgressBar
var _stats: Array[Label] = []
var _priorities: Array[Button] = []
var _dark: Color = Color.BLACK


func _init() -> void:
	theme_type_variation = &"GameCard"
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 9)
	add_child(column)
	var top := HBoxContainer.new()
	column.add_child(top)
	var title: Label = HudStyle.label(&"CardTitleLabel", "HUD_TURRET_TITLE")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	_hp = HudStyle.label(&"BodyHintLabel")
	top.add_child(_hp)
	_bar = ProgressBar.new()
	column.add_child(_bar)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override(&"h_separation", 9)
	column.add_child(grid)
	for key: String in ["HUD_STAT_DAMAGE", "HUD_STAT_RATE", "HUD_STAT_RANGE", "HUD_STAT_SPORES"]:
		var cell := VBoxContainer.new()
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.add_theme_constant_override(&"separation", 0)
		cell.add_child(HudStyle.label(&"TinyHintLabel", key))
		var value: Label = HudStyle.label(&"StatLabel")
		cell.add_child(value)
		_stats.append(value)
		grid.add_child(cell)
	column.add_child(HudStyle.label(&"TinyBoldHintLabel", "HUD_PRIORITY"))
	var buttons := GridContainer.new()
	buttons.columns = 4
	buttons.add_theme_constant_override(&"h_separation", 9)
	column.add_child(buttons)
	for index: int in range(PRIORITY_KEYS.size()):
		var button := Button.new()
		button.text = PRIORITY_KEYS[index]
		button.focus_mode = Control.FOCUS_NONE
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0.0, 54.0)
		button.add_theme_font_override(&"font", ThemeFactory.bold_font())
		button.add_theme_font_size_override(&"font_size", ThemeFactory.SMALL_SIZE)
		button.clip_text = true
		button.pressed.connect(func() -> void: priority_chosen.emit(index))
		buttons.add_child(button)
		_priorities.append(button)


## Branche la carte sur une partie, avec la teinte foncée de la colonie du joueur.
func setup(session: Session, dark: Color) -> void:
	_session = session
	_dark = dark
	HudStyle.paint_bar(_bar, dark, Settings.palette())
	refresh()


## Bouton d'une priorité (pour les tests).
func priority_button(priority: int) -> Button:
	return _priorities[priority]


## Met à jour les chiffres et la priorité choisie.
func refresh() -> void:
	var state: GameState = _session.simulation.state
	var defs: SimDefs = state.defs
	var colony: ColonyState = _session.colony()
	var maximum: int = ColonyStats.turret_max_hp(defs, colony)
	_hp.text = (
		tr("HUD_TURRET_HP") % [NumberFormat.amount(colony.turret_hp), NumberFormat.amount(maximum)]
	)
	_bar.value = clampf(float(colony.turret_hp) / float(maxi(1, maximum)), 0.0, 1.0)
	_stats[0].text = NumberFormat.amount(ColonyStats.damage(defs, colony))
	var rate: String = NumberFormat.decimal(
		Fixed.div_round(ColonyStats.rate_pm(state, colony), 100) * 100
	)
	_stats[1].text = tr("HUD_RATE_VALUE") % rate
	_stats[2].text = str(ColonyStats.turret_range(defs, colony))
	_stats[3].text = tr("HUD_SPORES_VALUE") % ColonyStats.spores(defs, colony)
	var palette: Palette = Settings.palette()
	for index: int in range(_priorities.size()):
		var chosen: bool = index == colony.priority
		HudStyle.paint_button(
			_priorities[index],
			_dark if chosen else palette.card,
			_dark if chosen else palette.line,
			Color.WHITE if chosen else palette.text,
			6
		)
