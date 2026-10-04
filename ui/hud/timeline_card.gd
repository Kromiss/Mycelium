class_name TimelineCard
extends PanelContainer
## Frise de la partie (maquette « Écran de partie », en haut à gauche de la carte) : horloge
## écoulé / total, barre du temps avec la fin de la protection de départ, étiquette de la
## protection tant qu'elle dure (décidé le 4 octobre 2026 : les événements arrivent en G4).
## En Bac à sable, une rangée de boutons : pause, vitesse, récapitulatif.

var pause_button: Button
var speed_button: Button
var recap_button: Button

var _session: Session
var _buttons: HBoxContainer
var _clock: Label
var _protection: Label
var _track: TimelineTrack


func _init() -> void:
	theme_type_variation = &"GameCard"
	mouse_filter = Control.MOUSE_FILTER_STOP
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 10)
	add_child(column)
	var top := HBoxContainer.new()
	column.add_child(top)
	_clock = HudStyle.label(&"ClockLabel")
	_clock.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_clock)
	_protection = HudStyle.label(&"TinyBoldHintLabel")
	top.add_child(_protection)
	_track = TimelineTrack.new()
	column.add_child(_track)
	_buttons = HBoxContainer.new()
	_buttons.add_theme_constant_override(&"separation", 10)
	column.add_child(_buttons)
	pause_button = _small_button(_buttons)
	speed_button = _small_button(_buttons)
	recap_button = _small_button(_buttons)
	recap_button.text = "HUD_RECAP"


## Branche la frise sur une partie, avec la couleur de la colonie du joueur.
func setup(session: Session, color: Color) -> void:
	_session = session
	_track.color = color
	_buttons.visible = session.has_time_control()
	refresh()


## Met à jour l'horloge, la barre et l'étiquette de la protection.
func refresh() -> void:
	var state: GameState = _session.simulation.state
	var defs: SimDefs = state.defs
	_clock.text = (
		tr("HUD_CLOCK") % [NumberFormat.clock(state.tick), NumberFormat.clock(defs.match_ticks)]
	)
	var left: int = defs.protection_ticks - state.tick
	_protection.visible = left > 0
	_protection.text = tr("HUD_PROTECTION") % NumberFormat.clock(maxi(0, left))
	_track.elapsed = float(state.tick) / float(maxi(1, defs.match_ticks))
	_track.protection = float(defs.protection_ticks) / float(maxi(1, defs.match_ticks))
	_track.queue_redraw()


static func _small_button(parent: Control) -> Button:
	var button := Button.new()
	button.theme_type_variation = &"SmallButton"
	button.focus_mode = Control.FOCUS_NONE
	parent.add_child(button)
	return button


## Barre du temps : la part écoulée se remplit de la couleur de la colonie ; une pastille
## marque la fin de la protection de départ.
class TimelineTrack:
	extends Control

	var elapsed: float = 0.0
	var protection: float = 0.0
	var color: Color = Color.WHITE

	func _init() -> void:
		custom_minimum_size = Vector2(0.0, 33.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var palette: Palette = Settings.palette()
		var mid: float = size.y * 0.5
		var track := Rect2(0.0, mid - 4.5, size.x, 9.0)
		draw_rect(track, palette.line)
		var fill := Rect2(track.position, Vector2(size.x * clampf(elapsed, 0.0, 1.0), 9.0))
		draw_rect(fill, color)
		if protection > 0.0 and protection < 1.0:
			var mark := Vector2(size.x * protection, mid)
			draw_circle(mark, 10.5, palette.text_secondary)
			draw_circle(mark, 6.0, palette.card)
