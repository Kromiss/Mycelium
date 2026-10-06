class_name ControlsText
extends RefCounted
## Nom de la touche liée à une action, pour les aides et l'écran des commandes.


## Nom de la première touche de l'action (« Maj », « Espace »…), ou « — » s'il n'y en a pas.
static func action_key(action: StringName) -> String:
	if not InputMap.has_action(action):
		return "—"
	for event: InputEvent in InputMap.action_get_events(action):
		if event is InputEventKey:
			var key := event as InputEventKey
			var code: Key = (
				key.physical_keycode if key.physical_keycode != KEY_NONE else key.keycode
			)
			return key_name(_logical(code))
	return "—"


## Nom d'une touche dans la langue du joueur (« Maj » pour Shift en français).
static func key_name(keycode: Key) -> String:
	var name: String = OS.get_keycode_string(keycode)
	var key: String = "KEY_" + name.to_upper().replace(" ", "_")
	var translated: String = TranslationServer.translate(key)
	return name if translated == key else translated


## Touche logique correspondant à une touche physique, selon la disposition du clavier
## (sans affichage, on garde la touche physique).
static func _logical(physical: Key) -> Key:
	if DisplayServer.get_name() == "headless":
		return physical
	var logical: Key = DisplayServer.keyboard_get_keycode_from_physical(physical)
	return physical if logical == KEY_NONE else logical
