class_name Hud
extends Control
## Interface de l'écran de partie (maquettes G3 validées le 4 octobre 2026, GDD §16.2) :
## - sur la carte, à gauche : frise (horloge, protection ; pause, vitesse et récapitulatif en
##   Bac à sable), mini-classement, journal, rappel des gestes, messages, annonce des paliers,
##   cartes de mutation ;
## - panneau de droite : ressources, Tourelle et priorité de tir, mutations prises,
##   améliorations, capacités ;
## - info-bulle d'une case, menu de partie (Échap) et panneau de fin.
## Les ordres passent par la Session, après avoir demandé à la simulation s'ils seraient
## acceptés : les règles restent dans sim/.

## Le joueur a cliqué sur une capacité (le geste continue sur la carte pour le Mur et le Nuage).
signal ability_requested(index: int)

## Durée d'affichage d'un message, en secondes.
const TOAST_TIME: float = 2.6
## Durée de l'annonce d'un palier, en secondes.
const BANNER_TIME: float = 1.6
## Décalage de l'info-bulle par rapport à la souris, en pixels.
const TOOLTIP_OFFSET := Vector2(22.0, 22.0)
## Délai minimal entre deux alertes d'attaque d'une même colonie dans le journal, en secondes.
const ATTACK_ALERT_TICKS: int = 20

var _session: Session
var _config: SandboxConfig
var _main: Array[Color] = []
var _dark: Array[Color] = []
var _toast_left: float = 0.0
var _tooltip_cell: int = -1
## Vrai si le menu de partie a lui-même mis le jeu en pause (il le relance en se fermant).
var _menu_paused: bool = false
## Vrai si le joueur a caché les cartes de mutation (bouton œil).
var _offer_hidden: bool = false
## Nombre de mutations prises au dernier tick (pour noter les choix dans le journal).
var _mutation_count: int = 0
## Dernière alerte d'attaque de chaque colonie (tick).
var _last_alert: Dictionary[int, int] = {}
var _hint_mode: MapInput.Mode = MapInput.Mode.TARGET
var _hint_ability: int = -1

@onready var _map_area: Control = %MapArea
@onready var _timeline: TimelineCard = %TimelineCard
@onready var _ranking: RankingCard = %RankingCard
@onready var _journal: JournalCard = %JournalCard
@onready var _overlay: MutationOverlay = %MutationOverlay
@onready var _resources: ResourcesCard = %ResourcesCard
@onready var _turret: TurretCard = %TurretCard
@onready var _mutations: MutationsCard = %MutationsCard
@onready var _upgrades: UpgradesCard = %UpgradesCard
@onready var _abilities: AbilityBar = %AbilityBar
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
	_timeline.pause_button.pressed.connect(_on_pause_pressed)
	_timeline.speed_button.pressed.connect(_on_speed_pressed)
	_timeline.recap_button.pressed.connect(copy_recap)
	_resume_button.pressed.connect(close_game_menu)
	_menu_recap_button.pressed.connect(copy_recap)
	_restart_button.pressed.connect(_restart)
	_quit_button.pressed.connect(_quit)
	_end_recap_button.pressed.connect(copy_recap)
	_replay_button.pressed.connect(_restart)
	_end_menu_button.pressed.connect(_quit)
	_turret.priority_chosen.connect(_on_priority_chosen)
	_upgrades.buy_requested.connect(_on_buy_requested)
	_abilities.ability_pressed.connect(func(index: int) -> void: ability_requested.emit(index))
	_overlay.chosen.connect(choose_mutation)
	_overlay.hide_requested.connect(hide_offer)
	_mutations.reopen_requested.connect(show_offer)
	Settings.palette_changed.connect(_apply_palette)


## Branche l'interface sur une partie, avec les couleurs de chaque colonie (principale et
## foncée, par numéro de colonie).
func setup(session: Session, config: SandboxConfig, main: Array[Color], dark: Array[Color]) -> void:
	_session = session
	_config = config
	_main = main
	_dark = dark
	var local: int = session.local_colony
	_timeline.setup(session, main[local])
	_ranking.setup(session, main)
	_resources.setup(session, main[local], dark[local])
	_turret.setup(session, dark[local])
	_mutations.setup(session, main[local], dark[local])
	_upgrades.setup(session, main[local], dark[local])
	_abilities.setup(session, dark[local])
	_overlay.setup(session, main[local], dark[local])
	_mutation_count = session.colony().mutations.size()
	_session.ticked.connect(_on_ticked)
	_session.paused_changed.connect(_on_paused_changed)
	_session.speed_changed.connect(_on_speed_changed)
	_session.game_finished.connect(_on_game_finished)
	_on_speed_changed(_session.speed)
	_apply_palette(Settings.palette())
	_update_hint()
	_update_state()


## Partie de l'écran occupée par la carte, en pixels d'écran (pour la caméra).
func map_rect() -> Rect2:
	return _map_area.get_global_rect()


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


## Geste en cours sur la carte (rappel des gestes en bas de la carte).
func set_input_mode(mode: MapInput.Mode, ability: int) -> void:
	_hint_mode = mode
	_hint_ability = ability
	_update_hint()


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


## Vrai si les cartes de mutation sont à l'écran.
func is_offer_visible() -> bool:
	return _overlay.visible


## Montre les cartes du premier choix de mutation en attente (s'il y en a un).
func show_offer() -> void:
	_offer_hidden = false
	_overlay.show_offer()
	_mutations.refresh(false)


## Cache les cartes de mutation (bouton œil) ; le panneau permet de les rouvrir.
func hide_offer() -> void:
	_offer_hidden = true
	_overlay.visible = false
	_mutations.refresh(true)


## Choisit la carte « choice » (0 à 2) du premier choix en attente.
func choose_mutation(choice: int) -> void:
	if not _overlay.visible:
		return
	_send(ChooseMutationCommand.new(choice))


## Les journal, classement et cartes du panneau (pour les tests).
func journal() -> JournalCard:
	return _journal


func turret_card() -> TurretCard:
	return _turret


func upgrades_card() -> UpgradesCard:
	return _upgrades


func ability_bar() -> AbilityBar:
	return _abilities


func mutation_overlay() -> MutationOverlay:
	return _overlay


func mutations_card() -> MutationsCard:
	return _mutations


func _process(delta: float) -> void:
	if _session == null:
		return
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


# --- Ordres ---


## Envoie un ordre de la colonie du joueur, ou montre pourquoi il serait refusé.
func _send(command: Command) -> void:
	if not _session.accepts_commands():
		var paused: bool = _session.is_running()
		show_message(
			tr("HUD_PAUSED_NO_ORDERS") if paused else MapInput.refusal_text(Refusal.Code.GAME_OVER)
		)
		return
	command.colony_id = _session.local_colony
	var code: Refusal.Code = _session.simulation.check(command)
	if code != Refusal.Code.OK:
		show_message(MapInput.refusal_text(code))
		return
	_session.send_command(command)


func _on_priority_chosen(priority: int) -> void:
	_send(SetPriorityCommand.new(priority))


func _on_buy_requested(upgrade: StringName, count: int) -> void:
	_send(BuyUpgradeCommand.new(upgrade, count))


# --- Mise à jour ---


func _on_ticked(result: TickResult) -> void:
	var colony_id: int = _session.local_colony
	for i: int in range(0, result.tier_changes.size(), 3):
		var new_tier: int = result.tier_changes[i + 2]
		if result.tier_changes[i] == colony_id and new_tier > result.tier_changes[i + 1]:
			announce_tier(new_tier)
	for i: int in range(result.refused.size()):
		if result.refused[i].colony_id == colony_id:
			show_message(MapInput.refusal_text(result.refused_codes[i] as Refusal.Code))
	HudJournal.record(_journal, result, _session, _last_alert, ATTACK_ALERT_TICKS)
	_note_mutation_choice(result.tick)
	_update_offer(result)
	_update_state()


## Note dans le journal les mutations choisies depuis le dernier tick.
func _note_mutation_choice(tick: int) -> void:
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = _session.simulation.state.defs
	while _mutation_count < colony.mutations.size():
		var mutation: SimMutation = defs.mutations[colony.mutations[_mutation_count]]
		_journal.add_entry(tick, tr("JOURNAL_MUTATION") % tr(mutation.name_key))
		_mutation_count += 1


## Cartes de mutation : un nouveau choix les montre ; après un choix, le suivant s'affiche
## (choix empilés) ou elles se ferment.
func _update_offer(result: TickResult) -> void:
	var colony: ColonyState = _session.colony()
	if colony.pending_offers.is_empty():
		_overlay.visible = false
		_offer_hidden = false
	elif result.mutation_offers.has(colony.id) or (_overlay.visible and not _offer_hidden):
		show_offer()


## Tout ce qui ne change qu'à chaque tick.
func _update_state() -> void:
	_timeline.refresh()
	_ranking.refresh()
	_resources.refresh()
	_turret.refresh()
	_mutations.refresh(_offer_hidden)
	_upgrades.refresh()
	_abilities.refresh()
	_update_tooltip()


func _update_hint() -> void:
	var cancel: String = ControlsText.action_key("back_to_menu")
	match _hint_mode:
		MapInput.Mode.MOVE:
			_hint_label.text = tr("HUD_HINT_MOVE") % cancel
		MapInput.Mode.ABILITY:
			var ability: SimAbility = _session.simulation.state.defs.abilities[_hint_ability]
			_hint_label.text = tr("HUD_HINT_ABILITY") % [tr(ability.name_key), cancel]
		_:
			_hint_label.text = tr("HUD_HINT") % ControlsText.action_key("move_turret")


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
	var area: Rect2 = map_rect()
	var pos: Vector2 = mouse + TOOLTIP_OFFSET
	pos.x = minf(pos.x, area.end.x - _tooltip.size.x - 8.0)
	pos.y = minf(pos.y, area.end.y - _tooltip.size.y - 8.0)
	_tooltip.position = pos


func _apply_palette(palette: Palette) -> void:
	var dim: Color = palette.background
	dim.a = 0.7
	_menu_dim.color = dim
	_end_dim.color = dim
	if _session != null:
		_overlay.apply_palette(palette)
		_update_state()


# --- Temps ---


func _on_pause_pressed() -> void:
	_session.set_paused(not _session.paused)


func _on_speed_pressed() -> void:
	_session.cycle_speed()


func _on_paused_changed(paused: bool) -> void:
	_timeline.pause_button.text = tr("HUD_RESUME") if paused else tr("HUD_PAUSE")
	_paused_label.visible = paused and not _game_menu.visible


func _on_speed_changed(speed: int) -> void:
	_timeline.speed_button.text = tr("HUD_SPEED") % speed
	_timeline.pause_button.text = tr("HUD_RESUME") if _session.paused else tr("HUD_PAUSE")


func _on_game_finished() -> void:
	_game_menu.visible = false
	_overlay.visible = false
	_paused_label.visible = false
	_timeline.pause_button.disabled = true
	_timeline.speed_button.disabled = true
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
