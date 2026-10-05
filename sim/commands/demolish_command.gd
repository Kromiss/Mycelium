class_name DemolishCommand
extends CellCommand
## Démolit un de mes bâtiments (GDD §5 bis) : il disparaît et sa place est rendue, sans
## remboursement.


func _init(target: Vector2i = Vector2i.ZERO, colony: int = 0) -> void:
	type = Type.DEMOLISH
	cell = target
	colony_id = colony
