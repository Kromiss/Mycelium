class_name MoveTurretCommand
extends CellCommand
## Fait faire un pas à la Tourelle vers une de mes cases voisines (GDD §5.5).


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.MOVE_TURRET
	cell = target
	colony_id = colony
