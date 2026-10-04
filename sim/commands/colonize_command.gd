class_name ColonizeCommand
extends CellCommand
## Coloniser une case libre collée au réseau : la pousse démarre tout de suite, sinon la
## commande est refusée (GDD §4.4, §13.4). Elle passe devant une file qui attend.


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.COLONIZE
	cell = target
	colony_id = colony
