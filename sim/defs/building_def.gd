class_name BuildingDef
extends Resource
## Un bâtiment (GDD §5 bis) : posé sur une de mes cases, payé en Enzymes, débloqué par un
## palier. Il tire comme le Sporophore, avec ses propres multiplicateurs et sa portée.

## Ce que le bâtiment vise (fixe par type).
enum Kind {
	## Les cases libres collées à mon territoire (Essaimeur).
	SWARMER,
	## Les cases adverses collées à mon territoire (Avant-poste, décidé le 6 octobre 2026).
	OUTPOST,
	## Les bâtiments et Sporophores adverses, même loin de mon territoire (Mortier).
	MORTAR,
}

## Identifiant technique (« swarmer », « outpost », « mortar »).
@export var id: StringName = &""
## Clé de traduction du nom.
@export var name_key: String = ""
@export var kind: Kind = Kind.SWARMER
## Palier de colonie qui le débloque.
@export var unlock_tier: int = 1
## Prix en Enzymes entières.
@export var cost_enzymes: int = 10
## Durée du chantier, en secondes.
@export var build_ticks: int = 5
## Portée, en cases.
@export var reach: int = 2
## Dégâts et cadence, en multiple de ceux du Sporophore (pour-mille).
@export var damage_pm: int = 1000
@export var rate_pm: int = 1000
## PV max, en millièmes (avant l'amélioration PV des cases).
@export var hp: int = 120_000
