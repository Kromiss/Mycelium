class_name ZoneTable
extends Resource
## Les zones de la forêt, du bord (zone 1) au centre.

@export var zones: Array[ZoneDef] = []


## Nombre de zones.
func count() -> int:
	return zones.size()
