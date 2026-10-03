class_name ZoneDef
extends Resource
## Définition d'une zone de la forêt (GDD §4.3). Les multiplicateurs sont en pour-mille :
## 1000 = ×1,0 ; 1500 = ×1,5.

## Numéro de la zone : 1 au bord, 6 au centre (la Clairière).
@export var zone: int = 1
## Richesse des cases (multiplicateur de production).
@export var richness_pm: int = 1000
## Multiplicateur du coût de colonisation.
@export var colonize_cost_pm: int = 1000
## Multiplicateur du temps de pousse.
@export var growth_time_pm: int = 1000
## Multiplicateur du temps de prise par un adversaire.
@export var capture_time_pm: int = 1000
