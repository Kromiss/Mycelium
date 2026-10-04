class_name BuyUpgradeCommand
extends Command
## Achète des niveaux d'une amélioration (GDD §9) : 1, 10 ou autant que possible (0).

## Identifiant de l'amélioration.
var upgrade: StringName = &""
## Nombre de niveaux voulus (0 : le maximum payable).
var count: int = 1


func _init(id: StringName, levels: int = 1, colony: int = 0) -> void:
	type = Type.BUY_UPGRADE
	upgrade = id
	count = levels
	colony_id = colony


func to_dict() -> Dictionary:
	var data: Dictionary = super.to_dict()
	data["upgrade"] = String(upgrade)
	data["count"] = count
	return data


func _read_fields(data: Dictionary) -> void:
	upgrade = StringName(str(data.get("upgrade", "")))
	count = DictRead.get_int(data, "count", 1)
