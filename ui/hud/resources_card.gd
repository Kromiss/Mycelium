class_name ResourcesCard
extends PanelContainer
## Carte des ressources (maquette « Écran de partie », en haut du panneau) : nutriments en
## grand (ils défilent entre deux ticks), production par seconde, Enzymes, Biomasse et barre
## du prochain palier.

var _session: Session
var _nutrients: Label
var _rate: Label
var _enzymes: Label
var _biomass: Label
var _bar: ProgressBar
var _tier: Label


func _init() -> void:
	theme_type_variation = &"GameCard"
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 8)
	add_child(column)
	var top := HBoxContainer.new()
	column.add_child(top)
	_nutrients = HudStyle.label(&"BigNumberLabel")
	_nutrients.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_nutrients)
	_rate = HudStyle.label(&"BoldLabel")
	_rate.size_flags_vertical = Control.SIZE_SHRINK_END
	top.add_child(_rate)
	var row := HBoxContainer.new()
	column.add_child(row)
	var title: Label = HudStyle.label(&"BodyHintLabel", "HUD_NUTRIENTS")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(title)
	_enzymes = HudStyle.label(&"BodyHintLabel")
	_enzymes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_enzymes.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	row.add_child(_enzymes)
	_biomass = HudStyle.label(&"BodyHintLabel")
	row.add_child(_biomass)
	_bar = ProgressBar.new()
	column.add_child(_bar)
	_tier = HudStyle.label(&"TinyHintLabel")
	column.add_child(_tier)


## Branche la carte sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, color: Color, dark: Color) -> void:
	_session = session
	_rate.add_theme_color_override(&"font_color", dark)
	HudStyle.paint_bar(_bar, color, Settings.palette())
	refresh()


## Tout ce qui ne change qu'à chaque tick.
func refresh() -> void:
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = _session.simulation.state.defs
	_rate.text = tr("HUD_PER_SECOND") % NumberFormat.rate(colony.production)
	_enzymes.text = tr("HUD_ENZYMES_AMOUNT") % NumberFormat.amount(colony.enzymes)
	_biomass.text = tr("HUD_BIOMASS_AMOUNT") % NumberFormat.amount(colony.biomass)
	_update_tier(defs, colony)
	update_nutrients()


## Les nutriments défilent : entre deux ticks, on ajoute la production déjà « en route ».
func update_nutrients() -> void:
	var colony: ColonyState = _session.colony()
	var shown: int = colony.nutrients
	if _session.is_running() and not _session.paused:
		shown += roundi(colony.production * _session.tick_fraction())
	_nutrients.text = NumberFormat.amount(shown)


func _process(_delta: float) -> void:
	if _session != null:
		update_nutrients()


func _update_tier(defs: SimDefs, colony: ColonyState) -> void:
	var tier: int = colony.tier
	var current: String = NumberFormat.multiplier(ColonyStats.tier_production_pm(defs, tier))
	if tier >= defs.tier_count():
		_bar.value = 1.0
		_tier.text = tr("HUD_LAST_TIER") % colony.cell_count
		return
	var start: int = MapGenerator.START_CELLS if tier == 0 else defs.tier_cells[tier - 1]
	var goal: int = defs.tier_cells[tier]
	_bar.value = clampf(float(colony.cell_count - start) / maxf(1.0, float(goal - start)), 0.0, 1.0)
	_tier.text = tr("HUD_TIER_PROGRESS") % [tier, current, colony.cell_count, goal, tier + 1]
