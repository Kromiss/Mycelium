class_name BalanceDef
extends Resource
## Constantes générales d'équilibrage (GDD §3.1, §4.4, §6.3). Valeurs de départ à simuler.
## Les quantités sont en millièmes de nutriment, les multiplicateurs en pour-mille.

## U : coût de colonisation d'une case de zone 1 au départ, en millièmes (30 nutriments).
@export var unit_cost: int = 30_000
## Rendement d'une case d'Humus de zone 1, en millièmes de nutriment par seconde.
@export var cell_yield: int = 3_333
## Durée de pousse d'une case de zone 1, en secondes (ticks).
@export var base_growth_ticks: int = 4
## Stock de départ, en multiples de U.
@export var start_stock_units: int = 6
## Hausse du coût de colonisation par case poussée au-delà des cases de départ (×1,02).
@export var colonize_cost_growth_pm: int = 1020
## Bonus de production de Cohésion par voisine possédée (+5 %).
@export var cohesion_per_neighbor_pm: int = 50
## Nombre de pousses simultanées au départ.
@export var max_growths: int = 1
## Taille de la file d'expansion, pousses en cours comprises.
@export var expansion_queue_size: int = 5
