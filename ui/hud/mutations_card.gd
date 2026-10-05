class_name MutationsCard
extends PanelContainer
## « Mes mutations » (panneau de droite, au-dessus des améliorations) : une seule ligne, le titre
## puis une petite icône par mutation prise, avec son palier ; nom et effet dans l'info-bulle
## (décidé le 5 octobre 2026 : le cadre prenait trop de place aux améliorations). Quand les
## cartes de mutation ont été cachées (bouton œil), un bouton les rouvre (décidé le 4 octobre
## 2026).

## Le joueur veut revoir les cartes du choix en attente.
signal reopen_requested

## Côté d'une icône de mutation, en pixels.
const ICON_SIZE: float = 42.0

var reopen_button: Button

var _session: Session
var _icons: HBoxContainer
var _main: Color = Color.WHITE
var _dark: Color = Color.BLACK
var _empty: Label
## Nombre de mutations et palette des icônes affichées.
var _shown_count: int = -1
var _shown_palette: Palette


func _notification(what: int) -> void:
	if what == NOTIFICATION_TRANSLATION_CHANGED:
		# Les infobulles des icônes sont traduites : à refaire au prochain rafraîchissement.
		_shown_count = -1


func _init() -> void:
	theme_type_variation = &"GameCard"
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 6)
	add_child(column)
	var line := HBoxContainer.new()
	line.add_theme_constant_override(&"separation", 8)
	# Hauteur d'une icône, avec ou sans mutation : le cadre ne grandit jamais.
	line.custom_minimum_size = Vector2(0.0, ICON_SIZE)
	column.add_child(line)
	var title: Label = HudStyle.label(&"TinyBoldHintLabel", "HUD_MUTATIONS")
	title.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(title)
	_empty = HudStyle.label(&"BodyHintLabel", "HUD_NO_MUTATION")
	_empty.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(_empty)
	_icons = HBoxContainer.new()
	_icons.add_theme_constant_override(&"separation", 6)
	line.add_child(_icons)
	reopen_button = EyeButton.new()
	reopen_button.pressed.connect(func() -> void: reopen_requested.emit())
	column.add_child(reopen_button)


## Branche la carte sur une partie, avec les couleurs de la colonie du joueur.
func setup(session: Session, main: Color, dark: Color) -> void:
	_session = session
	_main = main
	_dark = dark
	HudStyle.paint_button(reopen_button, dark, dark, Color.WHITE)
	# Place pour l'œil à gauche du texte.
	for state: StringName in [&"normal", &"hover", &"pressed", &"disabled"]:
		var box: StyleBox = reopen_button.get_theme_stylebox(state)
		box.content_margin_left = 64.0
	refresh(false)


## Nombre d'icônes affichées (une par mutation prise).
func icon_count() -> int:
	return _icons.get_child_count()


## Met à jour la ligne ; « offer_hidden » : un choix attend et ses cartes sont cachées.
func refresh(offer_hidden: bool) -> void:
	var colony: ColonyState = _session.colony()
	var defs: SimDefs = _session.simulation.state.defs
	var waiting: int = colony.pending_choice_count(defs.mutation_choices)
	reopen_button.visible = offer_hidden and waiting > 0
	reopen_button.text = tr("HUD_CHOOSE_MUTATION") % waiting
	_empty.visible = colony.mutations.is_empty()
	# Les icônes ne sont refaites que si une mutation a été prise (ou la palette changée).
	var palette: Palette = Settings.palette()
	if colony.mutations.size() == _shown_count and palette == _shown_palette:
		return
	_shown_count = colony.mutations.size()
	_shown_palette = palette
	for child: Node in _icons.get_children():
		_icons.remove_child(child)
		child.queue_free()
	for i: int in range(colony.mutations.size()):
		var mutation: SimMutation = defs.mutations[colony.mutations[i]]
		var tier: int = colony.mutation_tiers[i] if i < colony.mutation_tiers.size() else 0
		var icon := MutationIcon.new()
		icon.tier = tier
		icon.pale = HudStyle.pale(_main, palette)
		icon.main = _main
		icon.dark = _dark
		icon.tooltip_text = (
			tr("HUD_MUTATION_ENTRY") % [tier, tr(mutation.name_key), tr(mutation.desc_key)]
		)
		_icons.add_child(icon)


## Icône d'une mutation prise : petit champignon sur une pastille pâle, numéro du palier en bas
## à droite.
class MutationIcon:
	extends Control

	var tier: int = 0
	var pale: Color = Color.WHITE
	var main: Color = Color.WHITE
	var dark: Color = Color.BLACK

	func _init() -> void:
		custom_minimum_size = Vector2(ICON_SIZE, ICON_SIZE)
		mouse_filter = Control.MOUSE_FILTER_STOP

	func _draw() -> void:
		var center: Vector2 = size * 0.5
		draw_circle(center, ICON_SIZE * 0.5, pale)
		TurretArt.draw_mushroom(self, center, ICON_SIZE * 0.62, 1, dark, main, TurretArt.INK)
		var badge := Vector2(size.x - 8.0, size.y - 8.0)
		draw_circle(badge, 9.0, dark)
		var font: Font = ThemeFactory.bold_font()
		var text: String = str(tier)
		var font_size: int = 14
		var width: float = font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var baseline := Vector2(badge.x - width * 0.5, badge.y + font_size * 0.36)
		draw_string(font, baseline, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color.WHITE)


## Bouton avec un œil dessiné à gauche du texte.
class EyeButton:
	extends Button

	func _init() -> void:
		focus_mode = Control.FOCUS_NONE
		custom_minimum_size = Vector2(0.0, 54.0)
		alignment = HORIZONTAL_ALIGNMENT_LEFT
		add_theme_font_override(&"font", ThemeFactory.bold_font())
		add_theme_font_size_override(&"font_size", ThemeFactory.BODY_SIZE)
		add_theme_constant_override(&"h_separation", 0)

	func _draw() -> void:
		var ink: Color = get_theme_color(&"font_color")
		HudIcons.draw_eye(self, Vector2(34.0, size.y * 0.5), 36.0, ink)
