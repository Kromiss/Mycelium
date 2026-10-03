class_name ModeDef
extends Resource
## Définition d'un mode de jeu et de la forme de sa forêt (GDD §2 et §4.1).

## Identifiant technique du mode (« duel », « ffa »).
@export var id: StringName = &""
## Clé de traduction du nom affiché.
@export var name_key: String = ""
## Nombre de colonies au départ.
@export var colonies: int = 2
## Épaisseur de chaque zone, en anneaux d'hexagones.
@export var rings_per_zone: int = 2


## Rayon de la forêt : toutes les zones ont la même épaisseur, la zone centrale
## contient la case du centre, donc rayon = anneaux par zone × nombre de zones − 1.
func radius(zone_count: int) -> int:
	return rings_per_zone * zone_count - 1
