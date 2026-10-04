class_name TierDef
extends Resource
## Un palier de colonie (GDD §8.3) : atteint quand la colonie a au moins « cells » cases, il
## porte sa production à « production_pm » (en pour-mille) ; la première fois, il donne un lot
## d'Enzymes et le choix d'une mutation.

## Numéro du palier (1 à 6).
@export var tier: int = 1
## Nombre de cases (Tourelle comprise) qui déclenche le palier.
@export var cells: int = 5
## Multiplicateur de production de la colonie à ce palier (2000 = ×2 par rapport au départ).
@export var production_pm: int = 2000
## Lot d'Enzymes reçu la première fois que le palier est atteint (Enzymes entières).
@export var enzymes: int = 20
