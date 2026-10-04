class_name ColonyColors
extends Resource
## Les 12 couleurs de colonie (GDD §13.2) : une teinte principale (cases) et une teinte
## foncée (Cœur, contours) par couleur, dans l'ordre du tableau du GDD.

## Clés de traduction des noms de couleur.
@export var names: Array[String] = []
## Teintes principales.
@export var main: Array[Color] = []
## Teintes foncées.
@export var dark: Array[Color] = []


## Nombre de couleurs.
func count() -> int:
	return main.size()


## Numéro d'une couleur d'après sa clé de nom (−1 si inconnue).
func index_of(name_key: String) -> int:
	return names.find(name_key)
