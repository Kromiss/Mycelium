class_name DequeueCommand
extends CellCommand
## Retirer une case de la file d'expansion, avec toutes les cases qui en dépendent en chaîne
## (GDD §4.4). Une pousse lancée va à son terme.


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.DEQUEUE
	cell = target
	colony_id = colony
