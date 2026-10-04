class_name CellCommand
extends Command
## Commande qui vise une case de la forêt, désignée par ses coordonnées axiales.

## Case visée.
var cell: Vector2i = Vector2i.ZERO


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["q"] = cell.x
	data["r"] = cell.y
	return data


func _read_fields(data: Dictionary) -> void:
	cell = Vector2i(DictRead.get_int(data, "q"), DictRead.get_int(data, "r"))
