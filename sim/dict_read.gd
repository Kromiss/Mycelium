class_name DictRead
extends RefCounted
## Lecture sûre de valeurs dans un dictionnaire venu d'un fichier ou du réseau (replays,
## commandes) : un nombre peut y arriver en entier ou en flottant (JSON), ou manquer.


## Entier rangé sous « key », ou « fallback » s'il manque ou n'est pas un nombre.
static func get_int(data: Dictionary, key: String, fallback: int = 0) -> int:
	return to_int(data.get(key, fallback), fallback)


## Tableau d'entiers rangé sous « key » (vide s'il manque).
static func get_ints(data: Dictionary, key: String) -> PackedInt32Array:
	var result := PackedInt32Array()
	var value: Variant = data.get(key, [])
	if value is PackedInt32Array:
		var packed: PackedInt32Array = value
		return packed.duplicate()
	if value is Array:
		var items: Array = value
		for item: Variant in items:
			result.append(to_int(item, 0))
	return result


## Conversion d'une valeur en entier, ou « fallback » si ce n'est pas un nombre.
static func to_int(value: Variant, fallback: int = 0) -> int:
	if value is int:
		var whole: int = value
		return whole
	if value is float:
		var real: float = value
		return roundi(real)
	return fallback
