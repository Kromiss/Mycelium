class_name Hud
extends Control
## HUD d'une partie de Bac à sable (GDD §6.5, §13.6, §15 ligne G1) : nutriments qui défilent,
## production, Biomasse, courbe de production, barre du prochain palier, file d'expansion,
## horloge (écoulé / total), pause, vitesse et récapitulatif ; messages, info-bulle, menu de
## partie (Échap) et panneau de fin à 30:00. G2 (§13.6) : plafond du stock, Enzymes, file de
## construction et chantiers, palette des bâtiments, menu rond et panneau d'un bâtiment.

## Un bâtiment a été choisi (ou rechoisi) dans la palette.
signal placing_selected(building: StringName)
## Un bâtiment a été choisi dans le menu rond d'une case.
signal build_chosen(cell: int, building: StringName)
## Le joueur demande de démolir (ou d'annuler) le bâtiment d'une case.
signal demolish_requested(cell: int)

## Durée d'affichage d'un message, en secondes.
const TOAST_TIME: float = 2.6
## Durée de l'annonce d'un palier, en secondes.
const BANNER_TIME: float = 1.6
## Décalage de l'info-bulle par rapport à la souris, en pixels.
const TOOLTIP_OFFSET := Vector2(22.0, 22.0)

var _session: Session
var _config: SandboxConfig
var _color: Color = Color.WHITE
var _dark: Color = Color.BLACK
## Bâtiment choisi dans la palette (vide : aucun).
var _placing: StringName = &""
## Position à l'écran d'une case (fournie par l'écran de jeu, qui connaît la caméra).
var _cell_to_screen: Callable = func(_cell: int) -> Vector2: return Vector2.ZERO
var _toast_left: float = 0.0
var _tooltip_cell: int = -1
## Vrai si le menu de partie a lui-même mis le jeu en pause (il le relance en se fermant).
var _menu_paused: bool = false
var _replay_title: String = ""

@onready var _nutrients_label: Label = %NutrientsLabel
@onready var _rate_label: Label = %RateLabel
@onready var _biomass_label: Label = %BiomassLabel
@onready var _stock_label: Label = %StockLabel
@onready var _stock_bar: ProgressBar = %StockBar
@onready var _enzymes_label: Label = %EnzymesLabel
@onready var _build_queue: BuildQueueView = %BuildQueue
@onready var _palette: BuildingPalette = %Palette
@onready var _palette_panel: PanelContainer = %PalettePanel
@onready var _radial: RadialMenu = %RadialMenu
@onready var _building_panel: BuildingPanel = %BuildingPanel
@onready var _curve: ProductionCurve = %Curve
@onready var _tier_label: Label = %TierLabel
@onready var _tier_bar: ProgressBar = %TierBar
@onready var _next_tier_label: Label = %NextTierLabel
@onready var _queue_label: Label = %QueueLabel
@onready var _clock_label: Label = %ClockLabel
@onready var _pause_button: Button = %PauseButton
@onready var _speed_button: Button = %SpeedButton
@onready var _recap_button: Button = %RecapButton
@onready var _paused_label: Label = %PausedLabel
@onready var _banner: Label = %Banner
@onready var _toast: PanelContainer = %Toast
@onready var _toast_label: Label = %ToastLabel
@onready var _hint_label: Label = %HintLabel
@onready var _tooltip: PanelContainer = %Tooltip
@onready var _tooltip_label: Label = %TooltipLabel
@onready var _game_menu: Control = %GameMenu
@onready var _menu_dim: ColorRect = %MenuDim
@onready var _end_panel: Control = %EndPanel
@onready var _end_dim: ColorRect = %EndDim
@onready var _end_summary: Label = %EndSummary
@onready var _resume_button: Button = %ResumeButton
@onready var _menu_recap_button: Button = %MenuRecapButton
@onready var _restart_button: Button = %RestartButton
@onready var _quit_button: Button = %QuitButton
@onready var _end_recap_button: Button = %EndRecapButton
@onready var _replay_button: Button = %ReplayButton
@onready var _end_menu_button: Button = %EndMenuButton


func _ready() -> void:
	_pause_button.pressed.connect(_on_pause_pressed)
	_speed_button.pressed.connect(_on_speed_pressed)
	_recap_button.pressed.connect(copy_recap)
	_resume_button.pressed.connect(close_game_menu)
	_menu_recap_button.pressed.connect(copy_recap)
	_restart_button.pressed.connect(_restart)
	_quit_button.pressed.connect(_quit)
	_end_recap_button.pressed.connect(copy_recap)
	_replay_button.pressed.connect(_restart)
	_end_menu_button.pressed.connect(_quit)
	_palette.selected.connect(func(building: StringName) -> void: placing_selected.emit(building))
	_radial.chosen.connect(_on_build_chosen)
	_building_panel.demolish_requested.connect(
		func(cell: int) -> void: demolish_requested.emit(cell)
	)
	_build_queue.cancel_requested.connect(func(cell: int) -> void: demolish_requested.emit(cell))
	Settings.palette_changed.connect(_apply_palette)
	_apply_palette(Settings.palette())


## Branche le HUD sur une partie, avec les couleurs de la colonie (principale et foncée).
## « replay_title » : titre d'un rejeu (vide sinon).
func setup(
	session: Session, config: SandboxConfig, color: Color, dark: Color, replay_title: String = ""
) -> void:
	_session = session
	_config = config
	_color = color
	_dark = dark
	_palette.setup(session, dark)
	_palette_panel.visible = not session.is_replay()
	_build_queue.setup(session, color, dark)
	_replay_title = replay_title
	_session.ticked.connect(_on_ticked)
	_session.paused_changed.connect(_on_paused_changed)
	_session.speed_changed.connect(_on_speed_changed)
	_session.game_finished.connect(_on_game_finished)
	_on_speed_changed(_session.speed)
	_paint_tier_bar()
	_update_hint()
	_update_state()


## Montre un message au joueur pendant quelques secondes (texte déjà traduit).
func show_message(text: String) -> void:
	_toast_label.text = text
	_toast.visible = true
	_toast_left = TOAST_TIME


## Annonce un palier atteint (« Palier ×2 ! »).
func announce_tier(tier: int) -> void:
	var multiplier: String = NumberFormat.multiplier(
		TierSystem.production_pm(_session.simulation.state.defs, tier)
	)
	_banner.text = tr("HUD_TIER_BANNER") % multiplier
	_banner.visible = true
	_banner.modulate.a = 1.0
	_banner.scale = Vector2.ONE * 0.6
	var tween: Tween = create_tween()
	tween.tween_property(_banner, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK)
	tween.tween_interval(BANNER_TIME)
	tween.tween_property(_banner, "modulate:a", 0.0, 0.4)
	tween.tween_callback(_banner.hide)


## Case dont on montre l'info-bulle (−1 : aucune).
func set_tooltip_cell(cell: int) -> void:
	_tooltip_cell = cell
	_update_tooltip()


## Bâtiment choisi dans la palette (vide : aucun).
func set_placing(building: StringName) -> void:
	_placing = building
	_palette.set_placing(building)
	_update_tooltip()


## Donne au HUD le moyen de placer le menu rond sur sa case.
func set_cell_to_screen(converter: Callable) -> void:
	_cell_to_screen = converter


## Ouvre le menu rond d'une case libre de la colonie.
func open_build_menu(cell: int) -> void:
	_building_panel.close()
	_radial.open(_session, cell, _dark)
	var point: Vector2 = _cell_to_screen.call(cell)
	_radial.set_center(point)


## Ouvre le panneau du bâtiment d'une case.
func open_building_panel(cell: int) -> void:
	_radial.close()
	_building_panel.open(_session, cell)


## Ferme le menu rond et le panneau d'un bâtiment.
func close_menus() -> void:
	_radial.close()
	_building_panel.close()


## Vrai si le menu rond ou le panneau d'un bâtiment est ouvert.
func is_menu_open() -> bool:
	return _radial.is_open() or _building_panel.is_open()


## Copie le récapitulatif dans le presse-papiers.
func copy_recap() -> void:
	var state: GameState = _session.simulation.state
	DisplayServer.clipboard_set(SandboxRecap.build(_config, state, _session.colony()))
	show_message(tr("HUD_COPIED"))


## Ouvre le menu de partie et met le jeu en pause (Échap).
func open_game_menu() -> void:
	if _end_panel.visible:
		return
	_menu_paused = not _session.paused
	_game_menu.visible = true
	_session.set_paused(true)
	_paused_label.visible = false
	_resume_button.grab_focus()


## Ferme le menu de partie et relance le jeu s'il l'avait mis en pause.
func close_game_menu() -> void:
	_game_menu.visible = false
	if _menu_paused:
		_session.set_paused(false)
	_menu_paused = false
	_paused_label.visible = _session.paused


## Vrai si le menu de partie est ouvert.
func is_game_menu_open() -> bool:
	return _game_menu.visible


func _process(delta: float) -> void:
	if _session == null:
		return
	_update_nutrients()
	if _radial.is_open():
		var point: Vector2 = _cell_to_screen.call(_radial.cell())
		_radial.set_center(point)
	if _toast.visible:
		_toast_left -= delta
		if _toast_left <= 0.0:
			_toast.visible = false
	if _tooltip.visible:
		_place_tooltip()


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED and is_node_ready() and _session != null:
		_update_hint()
		_update_state()
		_on_speed_changed(_session.speed)


# --- Mise à jour ---


func _on_ticked(result: TickResult) -> void:
	var colony_id: int = _session.local_colony
	for i: int in range(0, result.tier_changes.size(), 3):
		var changed: int = result.tier_changes[i]
		var new_tier: int = result.tier_changes[i + 2]
		if changed == colony_id and new_tier > result.tier_changes[i + 1]:
			announce_tier(new_tier)
	for i: int in range(result.refused.size()):
		if result.refused[i].colony_id == colony_id:
			show_message(MapInput.refusal_text(result.refused_codes[i] as Refusal.Code))
	_update_state()


## Tout ce qui ne change qu'à chaque tick.
func _update_state() -> void:
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = state.defs
	_clock_label.text = (
		tr("HUD_CLOCK") % [NumberFormat.clock(state.tick), NumberFormat.clock(defs.match_ticks)]
	)
	_rate_label.text = tr("HUD_PER_SECOND") % NumberFormat.rate(colony.production)
	_biomass_label.text = NumberFormat.amount(colony.biomass)
	_curve.set_data(_session.production_history, defs.match_ticks, _color)
	_update_tier(defs, colony)
	_queue_label.text = tr("HUD_QUEUE") % [colony.queue_load(), defs.expansion_queue_size]
	_update_stock(colony)
	_enzymes_label.text = (
		tr("HUD_ENZYMES_VALUE")
		% [NumberFormat.amount(colony.enzymes), NumberFormat.amount(colony.enzyme_production * 60)]
	)
	_build_queue.refresh()
	_palette.refresh()
	_radial.refresh()
	_building_panel.refresh()
	_update_nutrients()
	_update_tooltip()


## Plafond du stock : chiffre et barre, qui passe en couleur d'alerte quand le stock est plein.
func _update_stock(colony: ColonyState) -> void:
	_stock_label.text = NumberFormat.amount(colony.stock_cap)
	var full: bool = colony.stock_cap > 0 and colony.nutrients >= colony.stock_cap
	_stock_bar.value = (
		clampf(float(colony.nutrients) / float(colony.stock_cap), 0.0, 1.0)
		if colony.stock_cap > 0
		else 0.0
	)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Settings.palette().warning if full else _color
	fill.set_corner_radius_all(ThemeFactory.PILL_RADIUS)
	_stock_bar.add_theme_stylebox_override(&"fill", fill)


func _update_tier(defs: SimDefs, colony: ColonyState) -> void:
	var tier: int = colony.tier
	if tier == 0:
		_tier_label.text = tr("HUD_TIER_START")
	else:
		var current: String = NumberFormat.multiplier(TierSystem.production_pm(defs, tier))
		_tier_label.text = tr("HUD_TIER") % [tier, current]
	if tier >= defs.tier_cells.size():
		_tier_bar.value = 1.0
		_next_tier_label.text = tr("HUD_LAST_TIER") % colony.cell_count
		return
	var start: int = MapGenerator.START_CELLS if tier == 0 else defs.tier_cells[tier - 1]
	var goal: int = defs.tier_cells[tier]
	var span: float = maxf(1.0, float(goal - start))
	_tier_bar.value = clampf(float(colony.cell_count - start) / span, 0.0, 1.0)
	var next: String = NumberFormat.multiplier(TierSystem.production_pm(defs, tier + 1))
	_next_tier_label.text = tr("HUD_NEXT_TIER") % [colony.cell_count, goal, next]


## Les nutriments défilent : entre deux ticks, on ajoute la production déjà « en route ».
func _update_nutrients() -> void:
	var colony: ColonyState = _session.colony()
	var shown: int = colony.nutrients
	if _session.is_running() and not _session.paused:
		shown += roundi(colony.production * _session.tick_fraction())
		if colony.stock_cap > 0:
			shown = mini(shown, maxi(colony.stock_cap, colony.nutrients))
	_nutrients_label.text = NumberFormat.amount(shown)


func _update_hint() -> void:
	if _session.is_replay():
		_hint_label.text = _replay_title
		return
	_hint_label.text = (
		tr("HUD_HINT")
		% [
			ControlsText.action_key("queue_modifier"),
			ControlsText.action_key("recenter_camera"),
			ControlsText.action_key("back_to_menu"),
		]
	)
	if not _palette_panel.visible:
		return
	_hint_label.text += "\n" + tr("HUD_HINT_BUILD") % ControlsText.action_key("back_to_menu")


func _update_tooltip() -> void:
	if _session == null or _tooltip_cell < 0:
		_tooltip.visible = false
		return
	_tooltip_label.text = "\n".join(CellTooltip.lines(_session, _tooltip_cell, _placing))
	_tooltip.visible = true
	_tooltip.reset_size()
	_place_tooltip()


func _place_tooltip() -> void:
	var mouse: Vector2 = get_viewport().get_mouse_position()
	var area: Vector2 = get_viewport_rect().size
	var pos: Vector2 = mouse + TOOLTIP_OFFSET
	pos.x = minf(pos.x, area.x - _tooltip.size.x - 8.0)
	pos.y = minf(pos.y, area.y - _tooltip.size.y - 8.0)
	_tooltip.position = pos


## La barre du prochain palier prend la couleur de la colonie.
func _paint_tier_bar() -> void:
	var fill := StyleBoxFlat.new()
	fill.bg_color = _color
	fill.set_corner_radius_all(ThemeFactory.PILL_RADIUS)
	_tier_bar.add_theme_stylebox_override(&"fill", fill)


func _apply_palette(palette: Palette) -> void:
	var dim: Color = palette.background
	dim.a = 0.7
	_menu_dim.color = dim
	_end_dim.color = dim
	_curve.queue_redraw()


# --- Temps ---


func _on_pause_pressed() -> void:
	_session.set_paused(not _session.paused)


func _on_speed_pressed() -> void:
	_session.cycle_speed()


func _on_paused_changed(paused: bool) -> void:
	_pause_button.text = tr("HUD_RESUME") if paused else tr("HUD_PAUSE")
	_paused_label.visible = paused and not _game_menu.visible


func _on_speed_changed(speed: int) -> void:
	_speed_button.text = tr("HUD_SPEED") % speed
	_pause_button.text = tr("HUD_RESUME") if _session.paused else tr("HUD_PAUSE")


func _on_build_chosen(cell: int, building: StringName) -> void:
	_radial.close()
	build_chosen.emit(cell, building)


func _on_game_finished() -> void:
	close_menus()
	_palette_panel.visible = false
	_game_menu.visible = false
	_paused_label.visible = false
	_pause_button.disabled = true
	_speed_button.disabled = true
	var state: GameState = _session.simulation.state
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = state.defs
	_end_summary.text = (
		"\n"
		. join(
			[
				(
					tr("RECAP_CELLS")
					% [
						colony.cell_count,
						colony.tier,
						NumberFormat.multiplier(TierSystem.production_pm(defs, colony.tier)),
					]
				),
				(
					tr("RECAP_PRODUCTION")
					% [
						NumberFormat.rate(colony.production),
						NumberFormat.rate(colony.peak_production),
						NumberFormat.amount(colony.biomass),
						NumberFormat.amount(colony.nutrients),
					]
				),
			]
		)
	)
	_end_panel.visible = true
	_replay_button.grab_focus()


func _restart() -> void:
	if _session.is_replay():
		SceneRouter.start_replay(_session.replay, _replay_title)
	else:
		SceneRouter.start_sandbox(_config.duplicate_config())


## Quitte la partie : vers le menu principal, ou vers le panneau de simulations après un rejeu.
func _quit() -> void:
	if _session.is_replay():
		SceneRouter.goto_simulation_panel()
	else:
		SceneRouter.goto_main_menu()
