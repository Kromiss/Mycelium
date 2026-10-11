class_name HotspotCommand
extends CellCommand
## Pose un point chaud sur une case qui n'est pas à la colonie, ou le retire s'il y en a déjà
## un (GDD §5 bis.3, §5 bis.6). Au-delà du maximum, le plus ancien est remplacé.


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.HOTSPOT
	cell = target
	colony_id = colony
