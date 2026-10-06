class_name BuildingState
extends RefCounted
## Un bâtiment posé sur la carte (GDD §5 bis) : chantier, PV, tirs, sommeil après sa chute.
## Les quantités sont en millièmes.

## Rang du bâtiment dans SimDefs.buildings.
var type: int = 0
## Colonie à qui il appartient ; pendant son sommeil, la dernière qui l'a tenu.
var owner: int = -1
## Case où il est posé.
var cell: int = -1
## PV, en millièmes (0 pendant le sommeil).
var hp: int = 0
## Tick de la fin du chantier : le bâtiment est en chantier tant que tick < ready_tick.
var ready_tick: int = 0
## Tick du réveil d'un bâtiment tombé : il dort tant que tick < asleep_until (0 : réveillé).
var asleep_until: int = 0
## Cibles gardées, une par spore, dans l'ordre (la cible désignée de la colonie n'y figure pas).
var targets: PackedInt32Array = PackedInt32Array()
## Tirs accumulés, en millièmes de tir.
var shot_progress: int = 0


## Vrai pendant le chantier.
func building_up(tick: int) -> bool:
	return tick < ready_tick


## Vrai pendant le sommeil (bâtiment tombé : il ne fait rien et ne peut pas être frappé).
func asleep(tick: int) -> bool:
	return tick < asleep_until


## Vrai si le bâtiment tient sa case : en chantier ou actif, mais pas endormi.
func standing(tick: int) -> bool:
	return tick >= asleep_until


## Vrai si le bâtiment tire : ni en chantier, ni endormi.
func active(tick: int) -> bool:
	return tick >= ready_tick and tick >= asleep_until


## Valeurs entières du bâtiment, dans un ordre fixe, pour l'empreinte de la partie.
func hash_values() -> PackedInt64Array:
	var values := PackedInt64Array(
		[type, owner, cell, hp, ready_tick, asleep_until, shot_progress, targets.size()]
	)
	for value: int in targets:
		values.append(value)
	return values
