class_name SimColonyResult
extends RefCounted
## Mesures d'une colonie (un secteur) dans une partie simulée (GDD §18.5). Les minutes sont en
## flottants ; −1 signifie « jamais atteint ».

## Secteur de la colonie (0 = premier secteur) et profil de son robot.
var sector: int = 0
var profile: StringName = &""
## Minute d'arrivée dans chaque zone (index 0 = zone 1) et à chaque palier (index 0 = palier 1).
var zone_minutes: PackedFloat64Array = PackedFloat64Array()
var tier_minutes: PackedFloat64Array = PackedFloat64Array()
## Production moyenne de chaque minute (nutriments par seconde) et cases à la fin de chaque
## minute.
var production_per_minute: PackedFloat64Array = PackedFloat64Array()
var cells_per_minute: PackedFloat64Array = PackedFloat64Array()
## Niveau de chaque amélioration à la fin (rang dans SimDefs.upgrades).
var upgrade_levels: PackedInt32Array = PackedInt32Array()
## Rang final (1 = vainqueur), minute d'élimination (−1 : en vie) et Trophées.
var rank: int = 0
var eliminated_minute: float = -1.0
var trophies: int = 0
## État final.
var final_cells: int = 0
var final_tier: int = 0
var final_production: float = 0.0
var peak_production: float = 0.0
var biomass: float = 0.0
var cells_captured: int = 0
## Minutes jouées par la colonie (jusqu'à son élimination ou la fin de la partie).
var minutes_alive: float = 0.0
