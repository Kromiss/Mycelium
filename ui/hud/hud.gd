class_name Hud
extends Control
## HUD provisoire d'une partie de Bac à sable (G3, étape 1 ; le panneau des maquettes arrive à
## l'étape 2) : nutriments qui défilent, production, Enzymes, Biomasse, courbe de production,
## barre du prochain palier, chiffres de la Tourelle, horloge, pause, vitesse et récapitulatif ;
## messages, info-bulle, menu de partie (Échap) et panneau de fin.

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
var _toast_left: float = 0.0
var _tooltip_cell: int = -1
## Vrai si le menu de partie a lui-même mis le jeu en pause (il le relance en se fermant).
var _menu_paused: bool = false

@onready var _nutrients_label: Label = %NutrientsLabel
@onready var _rate_label: Label = %RateLabel
@onready var _biomass_label: Label = %BiomassLabel
@onready var _enzymes_label: Label = %EnzymesLabel
@onready var _curve: ProductionCurve = %Curve
@onready var _tier_label: Label = %TierLabel
@onready var _tier_bar: ProgressBar = %TierBar
@onready var _next_tier_label: Label = %NextTierLabel
@onready var _turret_label: Label = %TurretLabel
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
	Settings.palette_changed.connect(_apply_palette)
	_apply_palette(Settings.palette())


## Branche le HUD sur une partie, avec les couleurs de la colonie (principale et foncée).
func setup(session: Session, config: SandboxConfig, color: Color, dark: Color) -> void:
	_session = session
	_config = config
	_color = color
	_dark = dark
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
		ColonyStats.tier_production_pm(_session.simulation.state.defs, tier)
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
	_update_turret(defs, colony)
	_enzymes_label.text = NumberFormat.amount(colony.enzymes)
	_update_nutrients()
	_update_tooltip()


## Chiffres de la Tourelle : PV, dégâts, cadence, portée, spores par tir.
func _update_turret(defs: SimDefs, colony: ColonyState) -> void:
	if not colony.alive:
		_turret_label.text = tr("HUD_ELIMINATED")
		return
	var state: GameState = _session.simulation.state
	_turret_label.text = (
		tr("HUD_TURRET")
		% [
			NumberFormat.amount(colony.turret_hp),
			NumberFormat.amount(ColonyStats.turret_max_hp(defs, colony)),
			NumberFormat.amount(ColonyStats.damage(defs, colony)),
			NumberFormat.multiplier(ColonyStats.rate_pm(state, colony)).trim_prefix("×"),
			ColonyStats.turret_range(defs, colony),
			ColonyStats.spores(defs, colony),
		]
	)


func _update_tier(defs: SimDefs, colony: ColonyState) -> void:
	var tier: int = colony.tier
	if tier == 0:
		_tier_label.text = tr("HUD_TIER_START")
	else:
		var current: String = NumberFormat.multiplier(ColonyStats.tier_production_pm(defs, tier))
		_tier_label.text = tr("HUD_TIER") % [tier, current]
	if tier >= defs.tier_cells.size():
		_tier_bar.value = 1.0
		_next_tier_label.text = tr("HUD_LAST_TIER") % colony.cell_count
		return
	var start: int = MapGenerator.START_CELLS if tier == 0 else defs.tier_cells[tier - 1]
	var goal: int = defs.tier_cells[tier]
	var span: float = maxf(1.0, float(goal - start))
	_tier_bar.value = clampf(float(colony.cell_count - start) / span, 0.0, 1.0)
	var next: String = NumberFormat.multiplier(ColonyStats.tier_production_pm(defs, tier + 1))
	_next_tier_label.text = tr("HUD_NEXT_TIER") % [colony.cell_count, goal, next]


## Les nutriments défilent : entre deux ticks, on ajoute la production déjà « en route ».
func _update_nutrients() -> void:
	var colony: ColonyState = _session.colony()
	var shown: int = colony.nutrients
	if _session.is_running() and not _session.paused:
		shown += roundi(colony.production * _session.tick_fraction())
	_nutrients_label.text = NumberFormat.amount(shown)


func _update_hint() -> void:
	_hint_label.text = (
		tr("HUD_HINT")
		% [
			ControlsText.action_key("move_turret"),
			ControlsText.action_key("recenter_camera"),
			ControlsText.action_key("back_to_menu"),
		]
	)


func _update_tooltip() -> void:
	if _session == null or _tooltip_cell < 0:
		_tooltip.visible = false
		return
	_tooltip_label.text = "\n".join(CellTooltip.lines(_session, _tooltip_cell))
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


func _on_game_finished() -> void:
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
						NumberFormat.multiplier(ColonyStats.tier_production_pm(defs, colony.tier)),
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
	SceneRouter.start_sandbox(_config.duplicate_config())


func _quit() -> void:
	SceneRouter.goto_main_menu()
