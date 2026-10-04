class_name SimRunResult
extends RefCounted
## Mesures d'une partie simulée (GDD §14.5). Les minutes et les durées sont en flottants ;
## −1 signifie « jamais atteint ».

## Profil du robot, valeur balayée (si balayage) et graine.
var profile: int = 0
var sweep_value: float = 0.0
var game_seed: int = 0
## Minute d'arrivée dans chaque zone (index 0 = zone 1).
var zone_minutes: PackedFloat64Array = PackedFloat64Array()
## Minute d'arrivée à chaque palier (index 0 = palier 1).
var tier_minutes: PackedFloat64Array = PackedFloat64Array()
## Production moyenne de chaque minute, en nutriments par seconde.
var production_per_minute: PackedFloat64Array = PackedFloat64Array()
## Temps de remboursement moyen (secondes) des cases payées dans chaque tiers de la partie,
## et nombre de cases de chaque tiers qui ne se sont pas remboursées avant la fin.
var payback_seconds: PackedFloat64Array = PackedFloat64Array([-1.0, -1.0, -1.0])
var unpaid_cells: PackedInt32Array = PackedInt32Array([0, 0, 0])
## Part du temps (0 à 1) à attendre la pousse, les nutriments, ou sans rien à coloniser.
var waiting_growth: float = 0.0
var waiting_nutrients: float = 0.0
var waiting_nothing: float = 0.0
## État final.
var final_cells: int = 0
var final_tier: int = 0
var final_production: float = 0.0
var peak_production: float = 0.0
var biomass: float = 0.0
## Enregistrement de la partie, pour la rejouer sur la carte.
var replay: Replay
