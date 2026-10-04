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
## Durée maximale d'une partie, en secondes (ticks) : 30 min (GDD §2.6).
@export var match_ticks: int = 1800
## Pousses simultanées au plus, Mycorhizes comprises (GDD §4.4).
@export var max_growths_cap: int = 3
## Plafond de stock sans Grenier, en secondes de production (3 min, GDD §5).
@export var stock_cap_seconds: int = 180
## Durée de construction selon le palier de déblocage (départ, palier 1, 2…), en secondes.
@export var build_ticks_by_tier: Array[int] = [3, 5, 8, 11, 15, 20]
## Places de bâtiment au départ, et places gagnées à chaque palier (décidé le 4 octobre 2026).
@export var building_slots_base: int = 2
@export var building_slots_per_tier: int = 1
## Chantiers simultanés au départ, et au plus.
@export var base_build_sites: int = 2
@export var max_build_sites: int = 4
## Taille de la file de construction, chantiers en cours compris.
@export var build_queue_size: int = 5
## Remboursement d'un bâtiment démoli ou d'un chantier annulé (50 %).
@export var demolish_refund_pm: int = 500
