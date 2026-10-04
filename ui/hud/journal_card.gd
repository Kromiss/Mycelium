class_name JournalCard
extends PanelContainer
## Journal (maquette « Écran de partie », en bas à gauche de la carte) : les derniers faits de
## la partie, le plus récent en haut ; les alertes (attaques) sont écrites en Corail foncé.

## Nombre de lignes gardées.
const MAX_ENTRIES: int = 4
## Couleur des alertes (teinte foncée du Corail, comme sur la maquette).
const ALERT_COLOR := Color("#E64D43")

var _entries: VBoxContainer
var _empty: Label


func _init() -> void:
	theme_type_variation = &"GameCard"
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(495.0, 0.0)
	var column := VBoxContainer.new()
	column.add_theme_constant_override(&"separation", 6)
	add_child(column)
	column.add_child(HudStyle.label(&"TinyBoldHintLabel", "HUD_JOURNAL"))
	_empty = HudStyle.label(&"BodyHintLabel", "HUD_JOURNAL_EMPTY")
	column.add_child(_empty)
	_entries = VBoxContainer.new()
	_entries.add_theme_constant_override(&"separation", 6)
	column.add_child(_entries)


## Ajoute une ligne en haut du journal (texte déjà traduit), précédée de l'heure de la partie.
func add_entry(tick: int, text: String, alert: bool = false) -> void:
	var entry: Label = HudStyle.label(
		&"BoldLabel" if alert else &"BodyLabel", "%s · %s" % [NumberFormat.clock(tick), text]
	)
	entry.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if alert:
		entry.add_theme_color_override(&"font_color", ALERT_COLOR)
	_entries.add_child(entry)
	_entries.move_child(entry, 0)
	while _entries.get_child_count() > MAX_ENTRIES:
		var last: Node = _entries.get_child(_entries.get_child_count() - 1)
		_entries.remove_child(last)
		last.queue_free()
	_empty.visible = false


## Textes des lignes, du plus récent au plus ancien.
func texts() -> PackedStringArray:
	var result := PackedStringArray()
	for child: Node in _entries.get_children():
		result.append((child as Label).text)
	return result
