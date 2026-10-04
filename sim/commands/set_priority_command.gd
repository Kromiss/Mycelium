class_name SetPriorityCommand
extends Command
## Règle la priorité de tir de la Tourelle (GDD §5.3).

## Priorité choisie (ColonyState.Priority).
var priority: int = ColonyState.Priority.CLOSEST


func _init(value: int, colony: int = 0) -> void:
	type = Type.SET_PRIORITY
	priority = value
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["priority"] = priority
	return data


func _read_fields(data: Dictionary) -> void:
	priority = DictRead.get_int(data, "priority")
