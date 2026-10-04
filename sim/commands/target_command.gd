class_name TargetCommand
extends CellCommand
## Désigne une case visable comme cible prioritaire (clic, GDD §5.4) : la Tourelle la vise
## jusqu'à sa prise (ou, pour une de mes cases blessées, jusqu'à ce qu'elle soit à pleine vie).


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.TARGET
	cell = target
	colony_id = colony
