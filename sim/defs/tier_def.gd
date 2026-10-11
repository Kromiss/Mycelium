class_name TierDef
extends Resource
## Un palier de colonie (GDD §8.3) : atteint quand la colonie a au moins « cells » cases, il
## porte sa production à « production_pm » et le plafond de propagation à « cap_pm » (en
## pour-mille), et permet « hotspots » points chauds ; la première fois, il donne un lot
## d'Enzymes et, s'il en porte une, le choix d'une mutation (paliers 2, 4 et 6, G6).

## Numéro du palier (1 à 6).
@export var tier: int = 1
## Nombre de cases (Tourelle comprise) qui déclenche le palier.
@export var cells: int = 5
## Multiplicateur de production de la colonie à ce palier (2000 = ×2 par rapport au départ).
@export var production_pm: int = 2000
## Lot d'Enzymes reçu la première fois que le palier est atteint (Enzymes entières).
@export var enzymes: int = 20
## Multiplicateur du plafond de propagation à ce palier (1500 = ×1,5 par rapport au départ).
@export var cap_pm: int = 1000
## Nombre de points chauds permis à ce palier.
@export var hotspots: int = 1
## Vrai si le palier donne un choix de mutation la première fois qu'il est atteint.
@export var mutation: bool = false
