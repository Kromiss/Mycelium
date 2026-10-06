class_name TierTable
extends Resource
## Les paliers de colonie, du premier au dernier. Le départ (palier 0, ×1) n'y figure pas.

@export var tiers: Array[TierDef] = []


## Nombre de paliers.
func count() -> int:
	return tiers.size()
