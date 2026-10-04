class_name EnqueueCommand
extends CellCommand
## Ajouter une case à la fin de la file d'expansion (GDD §4.4). Si elle peut démarrer
## aussitôt, elle démarre au tick même.


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.ENQUEUE
	cell = target
	colony_id = colony
