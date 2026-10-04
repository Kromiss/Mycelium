class_name MutationDef
extends Resource
## Une mutation proposée au palier (GDD §10). Chaque champ est un modificateur ; les valeurs
## par défaut ne changent rien. Les multiplicateurs sont en pour-mille et se multiplient
## entre mutations ; les ajouts s'additionnent.

## Identifiant technique (« heavy_spores »…).
@export var id: StringName = &""
## Clés de traduction du nom et de l'effet.
@export var name_key: String = ""
@export var desc_key: String = ""
## Dégâts d'un tir, et cadence.
@export var damage_pm: int = 1000
@export var rate_pm: int = 1000
## Portée en plus (cases).
@export var range_add: int = 0
## Multiplicateur de la Cohésion (bonus par voisine et plafond), production et PV.
@export var cohesion_pm: int = 1000
## Régénération des cases et de la Tourelle.
@export var regen_pm: int = 1000
## Production des cases des zones « profondes » (BalanceDef.deep_zone et au-delà).
@export var deep_production_pm: int = 1000
## Dégâts infligés aux cases libres, et aux cases adverses (Tourelle comprise).
@export var free_damage_pm: int = 1000
@export var enemy_damage_pm: int = 1000
## Soin par spore.
@export var heal_pm: int = 1000
## Spores par tir en plus.
@export var spores_add: int = 0
## Lots d'Enzymes des paliers suivants.
@export var enzymes_pm: int = 1000
## Durée d'un pas de la Tourelle (secondes ; 0 : inchangée).
@export var step_ticks: int = 0
## PV de la Tourelle.
@export var turret_hp_pm: int = 1000
## Les cases touchées perdent leur régénération pendant ce nombre de secondes (0 : non).
@export var toxic_ticks: int = 0
## Coût des améliorations.
@export var cost_pm: int = 1000
