class_name UseAbilityCommand
extends CellCommand
## Lance une capacité active (GDD §11), sur une case choisie pour le Mur et le Nuage.

## Identifiant de la capacité.
var ability: StringName = &""


func _init(id: StringName, target: Vector2i = Vector2i.ZERO, colony: int = 0) -> void:
	type = Type.USE_ABILITY
	ability = id
	cell = target
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["ability"] = String(ability)
	return data


func _read_fields(data: Dictionary) -> void:
	super._read_fields(data)
	ability = StringName(str(data.get("ability", "")))
