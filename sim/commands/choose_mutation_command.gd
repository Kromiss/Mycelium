class_name ChooseMutationCommand
extends Command
## Choisit une mutation dans le premier choix en attente (GDD §10).

## Rang de la mutation dans le choix (0 à SimDefs.mutation_choices − 1).
var choice: int = 0


func _init(value: int, colony: int = 0) -> void:
	type = Type.CHOOSE_MUTATION
	choice = value
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["choice"] = choice
	return data


func _read_fields(data: Dictionary) -> void:
	choice = DictRead.get_int(data, "choice")
