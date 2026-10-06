class_name BuildCommand
extends CellCommand
## Pose un bâtiment sur une de mes cases (GDD §5 bis) : roue au clic droit, ou bouton du
## panneau puis clic.

## Identifiant du bâtiment.
var building: StringName = &""


func _init(id: StringName, target: Vector2i = Vector2i.ZERO, colony: int = 0) -> void:
	type = Type.BUILD
	building = id
	cell = target
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["building"] = String(building)
	return data


func _read_fields(data: Dictionary) -> void:
	super._read_fields(data)
	building = StringName(str(data.get("building", "")))
