class_name UpgradesCard
extends PanelContainer
## Améliorations (maquette « Écran de partie ») : onglets Attaque / Défense / Économie, choix
## ×1 / ×10 / Max, et une ligne par amélioration de l'onglet : pastille du niveau, nom, effet
## (avant → après), bouton du coût (plein s'il est payable, grisé sinon). Une amélioration
## verrouillée indique le palier requis. Lignes compactes (54 px, décidé le 5 octobre 2026)
## pour en voir plus sans faire défiler.

## Le joueur veut acheter « count » niveaux (0 : le maximum payable) d'une amélioration.
signal buy_requested(upgrade: StringName, count: int)

## Clés des onglets, dans l'ordre de UpgradeDef.Tab.
const TAB_KEYS: Array[String] = ["TAB_ATTACK", "TAB_DEFENSE", "TAB_ECONOMY"]
## Choix d'achat : nombre de niveaux (0 : le maximum payable) et clé du libellé.
const COUNTS: Array[int] = [1, 10, 0]
const COUNT_KEYS: Array[String] = ["BUY_ONE", "BUY_TEN", "BUY_MAX"]
## Hauteur d'une ligne d'amélioration, en pixels.
const ROW_HEIGHT: float = 54.0

var _session: Session
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _tab: int = UpgradeDef.Tab.ATTACK
var _count: int = 1
var _tabs: Array[Button] = []
var _counts: Array[Button] = []
var _rows: VBoxContainer
## Ligne de chaque amélioration (toutes les améliorations, construites une fois), par
## identifiant. Les lignes sont mises à jour sur place : un bouton n'est jamais recréé entre
## l'appui et le relâchement d'un clic.
var _lines: Dictionary[StringName, Line] = {}
## Palette avec laquelle les lignes ont été peintes (une autre palette les repeint toutes).
var _painted_palette: Palette


## Une ligne du panneau et ce qui y a été affiché en dernier.
class Line:
	extends RefCounted
	var upgrade: SimUpgrade
	var wrapper: HBoxContainer
	var badge: Label
	var effect: Label
	var button: Button
	## État peint en dernier (« locked », « payable », « idle ») : on ne repeint qu'au changement.
	var badge_state: String = ""
	var button_state: String = ""


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
	var line: Line = _lines.get(upgrade, null)
	if line == null or line.upgrade.tab != _tab:
		return null
	return line.button


## Met à jour l'onglet affiché : niveaux, effets, coûts et boutons (sans recréer les lignes).
func refresh() -> void:
	if _session == null:
		return
	var palette: Palette = Settings.palette()
	var repaint: bool = palette != _painted_palette
	_painted_palette = palette
	for index: int in range(_tabs.size()):
		_paint_toggle(_tabs[index], index == _tab, palette, true)
	for index: int in range(_counts.size()):
		_paint_toggle(_counts[index], COUNTS[index] == _count, palette, false)
	if _lines.is_empty():
		for upgrade: SimUpgrade in _session.simulation.state.defs.upgrades:
			var line: Line = _new_line(upgrade)
			_lines[upgrade.id] = line
			_rows.add_child(line.wrapper)
	for line: Line in _lines.values():
		line.wrapper.visible = line.upgrade.tab == _tab
		if repaint:
			line.badge_state = ""
			line.button_state = ""
			line.wrapper.queue_redraw()
		if line.wrapper.visible:
			_update_line(line, palette)


func _new_line(upgrade: SimUpgrade) -> Line:
	var line := Line.new()
	line.upgrade = upgrade
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 15)
	row.custom_minimum_size = Vector2(0.0, ROW_HEIGHT)
	line.badge = Label.new()
	line.badge.custom_minimum_size = Vector2(42.0, 42.0)
	line.badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	line.badge.add_theme_font_override(&"font", ThemeFactory.bold_font())
	line.badge.add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
	row.add_child(line.badge)
	var texts := VBoxContainer.new()
	texts.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	texts.alignment = BoxContainer.ALIGNMENT_CENTER
	texts.add_theme_constant_override(&"separation", 0)
	texts.add_child(HudStyle.label(&"BoldLabel", upgrade.name_key))
	line.effect = HudStyle.label(&"TinyHintLabel", "")
	line.effect.clip_text = true
	line.effect.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	texts.add_child(line.effect)
	row.add_child(texts)
	line.button = Button.new()
	# Réagit dès l'appui (pas au relâchement) : l'achat part tout de suite.
	line.button.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	line.button.focus_mode = Control.FOCUS_NONE
	line.button.custom_minimum_size = Vector2(132.0, 42.0)
	line.button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.button.add_theme_font_override(&"font", ThemeFactory.bold_font())
	line.button.add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
	line.button.pressed.connect(func() -> void: buy_requested.emit(upgrade.id, _count))
	row.add_child(line.button)
	var wrapper := HBoxContainer.new()
	wrapper.add_child(row)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wrapper.add_theme_constant_override(&"separation", 0)
	# Filet au-dessus de chaque ligne, comme sur la maquette.
	wrapper.draw.connect(
		func() -> void:
			var color: Color = Settings.palette().line
			wrapper.draw_line(Vector2.ZERO, Vector2(wrapper.size.x, 0.0), color, 2.0)
	)
	line.wrapper = wrapper
	return line


## Met une ligne à jour ; ses couleurs ne sont repeintes que si son état a changé.
func _update_line(line: Line, palette: Palette) -> void:
	var simulation: Simulation = _session.simulation
	var colony: ColonyState = _session.colony()
	var upgrade: SimUpgrade = line.upgrade
	var index: int = simulation.state.defs.upgrade_index(upgrade.id)
	var locked: bool = colony.tier < upgrade.unlock_tier
	line.badge.text = "—" if locked else str(colony.upgrade_levels[index])
	var badge_state: String = "locked" if locked else "open"
	if badge_state != line.badge_state:
		line.badge_state = badge_state
		line.badge.add_theme_color_override(
			&"font_color", palette.text_secondary if locked else _dark
		)
		line.badge.add_theme_stylebox_override(
			&"normal",
			HudStyle.pill(
				palette.line if locked else HudStyle.pale(_main, palette), palette.line, 0, 0, 0
			)
		)
	line.effect.text = _effect_text(upgrade, colony, locked)
	var preview: PackedInt64Array = simulation.upgrade_preview(colony.id, upgrade.id, _count)
	var payable: bool = not locked and preview[0] > 0
	line.button.text = _cost_text(upgrade, colony, locked, preview)
	line.button.disabled = not payable
	var button_state: String = "payable" if payable else "idle"
	if button_state != line.button_state:
		line.button_state = button_state
		HudStyle.paint_button(
			line.button,
			_dark if payable else palette.card,
			_dark if payable else palette.line,
			Color.WHITE if payable else palette.text_secondary,
			12
		)


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
