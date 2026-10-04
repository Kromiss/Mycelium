class_name DemolishCommand
extends CellCommand
## Démolir le bâtiment d'une case (GDD §7.1) : instantané. Un bâtiment encore en file est
## remboursé entièrement ; un chantier lancé ou un bâtiment construit, à moitié.


func _init(target: Vector2i, colony: int = 0) -> void:
	type = Type.DEMOLISH
	cell = target
	colony_id = colony
