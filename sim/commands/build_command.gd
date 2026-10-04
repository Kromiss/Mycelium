class_name BuildCommand
extends CellCommand
## Poser un bâtiment sur une case poussée de la colonie (GDD §7.1, §7.4) : il entre dans la
## file de construction, son prix est payé tout de suite.

## Identifiant du bâtiment (« digestion_node »…).
var building: StringName = &""


func _init(target: Vector2i, building_id: StringName, colony: int = 0) -> void:
	type = Type.BUILD
	cell = target
	building = building_id
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["building"] = String(building)
	return data


func _read_fields(data: Dictionary) -> void:
	super._read_fields(data)
	building = StringName(str(data.get("building", "")))
