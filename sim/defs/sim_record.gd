class_name SimRecord
extends RefCounted
## Copie en entiers d'un élément de contenu (amélioration, mutation, capacité), faite au
## lancement de la partie à partir de sa ressource de data/. Les sous-classes déclarent les
## mêmes champs que leur ressource et les listent dans fields() : la copie, la conversion en
## dictionnaire (replays, récapitulatif) et la lecture se font champ par champ.


## Noms des champs copiés, dans un ordre fixe.
func fields() -> PackedStringArray:
	return PackedStringArray()


## Copie les champs d'une ressource qui porte les mêmes noms.
func copy_from(source: Object) -> void:
	for field: String in fields():
		set(field, source.get(field))


## Conversion en dictionnaire.
func to_dict() -> Dictionary:
	var data: Dictionary = {}
	for field: String in fields():
		var value: Variant = get(field)
		if value is StringName:
			var name: StringName = value
			data[field] = String(name)
		else:
			data[field] = value
	return data


## Lecture depuis to_dict() : les identifiants redeviennent des StringName, les clés de
## traduction des textes, le reste des entiers.
func read_dict(data: Dictionary) -> void:
	for field: String in fields():
		var current: Variant = get(field)
		if current is StringName:
			set(field, StringName(str(data.get(field, ""))))
		elif current is String:
			set(field, str(data.get(field, "")))
		else:
			var fallback: int = current
			set(field, DictRead.get_int(data, field, fallback))
