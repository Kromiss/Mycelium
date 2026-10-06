class_name AbilityDef
extends Resource
## Une capacité active (GDD §11) : payée en Enzymes, avec une recharge, débloquée par un palier.

## Effet de la capacité.
enum Kind {
	## Cadence multipliée par « rate_pm » pendant « duration_ticks ».
	SALVO,
	## Mes cases à « radius » cases ou moins de la case choisie ne perdent aucun PV.
	WALL,
	## La case choisie (à portée) et ses voisines à « radius » : dégâts de « shots » tirs, et
	## plus de régénération pendant « duration_ticks ».
	CLOUD,
}

## Identifiant technique (« salvo », « wall », « cloud »).
@export var id: StringName = &""
## Clé de traduction du nom.
@export var name_key: String = ""
@export var kind: Kind = Kind.SALVO
## Coût en Enzymes entières.
@export var cost_enzymes: int = 20
## Recharge et durée de l'effet, en secondes.
@export var cooldown_ticks: int = 90
@export var duration_ticks: int = 10
## Palier de colonie qui la débloque.
@export var unlock_tier: int = 1
## Multiplicateur de cadence (SALVO), en pour-mille.
@export var rate_pm: int = 1000
## Rayon de l'effet, en cases (WALL, CLOUD).
@export var radius: int = 0
## Nombre de tirs dont les dégâts sont infligés (CLOUD).
@export var shots: int = 0
