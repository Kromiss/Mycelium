class_name UpgradesCard
extends PanelContainer
## Améliorations (maquette « Écran de partie ») : onglets Attaque / Défense / Économie, choix
## ×1 / ×10 / Max, et une ligne par amélioration de l'onglet : pastille du niveau, nom, effet
## (avant → après), bouton du coût (plein s'il est payable, grisé sinon). Une amélioration
## verrouillée indique le palier requis.

## Le joueur veut acheter « count » niveaux (0 : le maximum payable) d'une amélioration.
signal buy_requested(upgrade: StringName, count: int)

## Clés des onglets, dans l'ordre de UpgradeDef.Tab.
const TAB_KEYS: Array[String] = ["TAB_ATTACK", "TAB_DEFENSE", "TAB_ECONOMY"]
## Choix d'achat : nombre de niveaux (0 : le maximum payable) et clé du libellé.
const COUNTS: Array[int] = [1, 10, 0]
const COUNT_KEYS: Array[String] = ["BUY_ONE", "BUY_TEN", "BUY_MAX"]

var _session: Session
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _tab: int = UpgradeDef.Tab.ATTACK
var _count: int = 1
var _tabs: Array[Button] = []
var _counts: Array[Button] = []
var _rows: VBoxContainer
## Bouton d'achat de chaque amélioration de l'onglet affiché, par identifiant.
var _buy_buttons: Dictionary[StringName, Button] = {}


func _init() -> void:
	theme_type_variation = &"GameCard"
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 10)
	add_child(column)
	var top := HBoxContainer.new()
	top.add_theme_constant_override(&"separation", 9)
	column.add_child(top)
	for index: int in range(TAB_KEYS.size()):
		var tab: Button = _toggle(TAB_KEYS[index], 48.0)
		tab.pressed.connect(func() -> void: select_tab(index))
		top.add_child(tab)
		_tabs.append(tab)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	var counts := HBoxContainer.new()
	counts.add_theme_constant_override(&"separation", 3)
	top.add_child(counts)
	for index: int in range(COUNTS.size()):
		var button: Button = _toggle(COUNT_KEYS[index], 42.0)
		button.pressed.connect(func() -> void: select_count(COUNTS[index]))
		counts.add_child(button)
		_counts.append(button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override(&"separation", 0)
	scroll.add_child(_rows)


## Branche la carte sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	_main = main
	_dark = dark
	refresh()


## Affiche un onglet (UpgradeDef.Tab).
func select_tab(tab: int) -> void:
	_tab = tab
	refresh()


## Choisit le nombre de niveaux achetés par clic (1, 10 ou 0 pour le maximum payable).
func select_count(count: int) -> void:
	_count = count
	refresh()


## Nombre de niveaux achetés par clic.
func buy_count() -> int:
	return _count


## Bouton d'achat d'une amélioration de l'onglet affiché (null sinon), pour les tests.
func buy_button(upgrade: StringName) -> Button:
	return _buy_buttons.get(upgrade, null)


## Reconstruit les lignes de l'onglet affiché.
func refresh() -> void:
	if _session == null:
		return
	var palette: Palette = Settings.palette()
	for index: int in range(_tabs.size()):
		_paint_toggle(_tabs[index], index == _tab, palette, true)
	for index: int in range(_counts.size()):
		_paint_toggle(_counts[index], COUNTS[index] == _count, palette, false)
	for child: Node in _rows.get_children():
		child.queue_free()
	_buy_buttons.clear()
	var defs: SimDefs = _session.simulation.state.defs
	for upgrade: SimUpgrade in defs.upgrades:
		if upgrade.tab == _tab:
			_rows.add_child(_row(upgrade, palette))


func _row(upgrade: SimUpgrade, palette: Palette) -> HBoxContainer:
	var simulation: Simulation = _session.simulation
	var colony: ColonyState = _session.colony()
	var index: int = simulation.state.defs.upgrade_index(upgrade.id)
	var level: int = colony.upgrade_levels[index]
	var locked: bool = colony.tier < upgrade.unlock_tier
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 15)
	row.custom_minimum_size = Vector2(0.0, 69.0)
	var badge := Label.new()
	badge.text = "—" if locked else str(level)
	badge.custom_minimum_size = Vector2(51.0, 51.0)
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	badge.add_theme_font_override(&"font", ThemeFactory.bold_font())
	badge.add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
	badge.add_theme_color_override(&"font_color", palette.text_secondary if locked else _dark)
	badge.add_theme_stylebox_override(
		&"normal",
		HudStyle.pill(
			palette.line if locked else HudStyle.pale(_main, palette), palette.line, 0, 0, 0
		)
	)
	row.add_child(badge)
	var texts := VBoxContainer.new()
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.add_theme_constant_override(&"separation", 0)
	texts.add_child(HudStyle.label(&"BoldLabel", upgrade.name_key))
	var effect: Label = HudStyle.label(&"TinyHintLabel", _effect_text(upgrade, colony, locked))
	effect.clip_text = true
	effect.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	texts.add_child(effect)
	row.add_child(texts)
	var button := Button.new()
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(132.0, 54.0)
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.add_theme_font_override(&"font", ThemeFactory.bold_font())
	button.add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
	var preview: PackedInt64Array = simulation.upgrade_preview(colony.id, upgrade.id, _count)
	var payable: bool = not locked and preview[0] > 0
	button.text = _cost_text(upgrade, colony, locked, preview)
	button.disabled = not payable
	HudStyle.paint_button(
		button,
		_dark if payable else palette.card,
		_dark if payable else palette.line,
		Color.WHITE if payable else palette.text_secondary,
		12
	)
	button.pressed.connect(func() -> void: buy_requested.emit(upgrade.id, _count))
	row.add_child(button)
	_buy_buttons[upgrade.id] = button
	var wrapper := HBoxContainer.new()
	wrapper.add_child(row)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrapper.add_theme_constant_override(&"separation", 0)
	# Filet au-dessus de chaque ligne, comme sur la maquette.
	wrapper.draw.connect(
		func() -> void:
			wrapper.draw_line(Vector2.ZERO, Vector2(wrapper.size.x, 0.0), palette.line, 2.0)
	)
	return wrapper


## Effet affiché : palier requis si verrouillée, sinon effet d'un niveau et avant → après
## (pour le nombre de niveaux qu'achèterait le clic, au moins un).
func _effect_text(upgrade: SimUpgrade, colony: ColonyState, locked: bool) -> String:
	var defs: SimDefs = _session.simulation.state.defs
	if locked:
		return (
			tr("UPGRADE_LOCKED") % [upgrade.unlock_tier, defs.tier_cells[upgrade.unlock_tier - 1]]
		)
	if ColonyStats.upgrade_cost(defs, colony, defs.upgrade_index(upgrade.id)) < 0:
		return tr("UPGRADE_MAXED")
	var preview: PackedInt64Array = _session.simulation.upgrade_preview(
		colony.id, upgrade.id, _count
	)
	var levels: int = maxi(1, preview[0])
	var values: PackedInt64Array = _session.simulation.upgrade_values(colony.id, upgrade.id, levels)
	return GameText.upgrade_effect(upgrade, values)


## Texte du bouton : coût de ce qu'achèterait le clic (« +7 · 3,2 K » pour plusieurs niveaux),
## sinon coût du prochain niveau ; « — » si verrouillée, « Max » au niveau maximal.
func _cost_text(
	upgrade: SimUpgrade, colony: ColonyState, locked: bool, preview: PackedInt64Array
) -> String:
	if locked:
		return "—"
	var defs: SimDefs = _session.simulation.state.defs
	var next: int = ColonyStats.upgrade_cost(defs, colony, defs.upgrade_index(upgrade.id))
	if next < 0:
		return tr("BUY_MAX")
	if preview[0] > 1:
		return tr("UPGRADE_BUY_COUNT") % [preview[0], NumberFormat.amount(preview[1])]
	if preview[0] == 1:
		return NumberFormat.amount(preview[1])
	return NumberFormat.amount(next)


func _toggle(key: String, height: float) -> Button:
	var button := Button.new()
	button.text = key
	button.focus_mode = Control.FOCUS_NONE
	button.custom_minimum_size = Vector2(0.0, height)
	button.add_theme_font_override(&"font", ThemeFactory.bold_font())
	button.add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
	return button


## Onglet ou choix d'achat : plein (couleur du texte) s'il est choisi.
func _paint_toggle(button: Button, chosen: bool, palette: Palette, tab: bool) -> void:
	if tab:
		HudStyle.paint_button(
			button,
			palette.text if chosen else palette.card,
			palette.text if chosen else palette.line,
			palette.card if chosen else palette.text,
			15
		)
	else:
		HudStyle.paint_button(
			button,
			palette.card if chosen else palette.pill,
			palette.card if chosen else palette.pill,
			palette.text,
			12
		)
