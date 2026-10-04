class_name TierDef
extends Resource
## Un palier de colonie (GDD §6.1) : atteint quand la colonie a au moins « cells » cases
## poussées, il porte la production de la colonie à « production_pm » (en pour-mille).

## Numéro du palier (1 à 6).
@export var tier: int = 1
## Nombre de cases poussées qui déclenche le palier.
@export var cells: int = 5
## Multiplicateur de production de la colonie à ce palier (2000 = ×2 par rapport au départ).
@export var production_pm: int = 2000
