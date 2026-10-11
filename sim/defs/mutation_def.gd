class_name MutationDef
extends Resource
## Une mutation proposée au palier (GDD §10). Chaque champ est un modificateur ; les valeurs
## par défaut ne changent rien. Les multiplicateurs sont en pour-mille et se multiplient
## entre mutations ; les ajouts s'additionnent.

## Identifiant technique (« cohesion »…).
@export var id: StringName = &""
## Clés de traduction du nom et de l'effet.
@export var name_key: String = ""
@export var desc_key: String = ""
## Multiplicateur de la Cohésion (bonus par voisine et plafond), production et PV.
@export var cohesion_pm: int = 1000
## Régénération des cases et de la Tourelle.
@export var regen_pm: int = 1000
## Production des cases des zones « profondes » (BalanceDef.deep_zone et au-delà).
@export var deep_production_pm: int = 1000
## Lots d'Enzymes des paliers suivants.
@export var enzymes_pm: int = 1000
## PV de la Tourelle.
@export var turret_hp_pm: int = 1000
## Coût des améliorations.
@export var cost_pm: int = 1000
