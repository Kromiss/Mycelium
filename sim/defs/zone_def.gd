class_name ZoneDef
extends Resource
## Définition d'une zone de la forêt (GDD §4.3). Les multiplicateurs sont en pour-mille :
## 1000 = ×1,0 ; 1500 = ×1,5.

## Numéro de la zone : 1 au bord, 6 au centre (la Clairière).
@export var zone: int = 1
## Richesse des cases (multiplicateur de production).
@export var richness_pm: int = 1000
## Multiplicateur des PV d'une case libre (difficulté vers le centre).
@export var free_hp_pm: int = 1000
## Multiplicateur des PV d'une case possédée (défense de la zone).
@export var defense_pm: int = 1000
