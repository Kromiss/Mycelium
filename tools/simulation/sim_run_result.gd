class_name SimRunResult
extends RefCounted
## Mesures d'une partie simulée (GDD §18.5) : celles de la partie, puis celles de chaque
## colonie, dans l'ordre des secteurs. −1 signifie « jamais ».

## Valeur balayée (si balayage) et graine de la partie.
var sweep_value: float = 0.0
var game_seed: int = 0
## Mesures de chaque colonie, dans l'ordre des secteurs occupés.
var colonies: Array[SimColonyResult] = []
## Nombre d'éliminations et minute de la première (−1 : aucune).
var eliminations: int = 0
var first_elimination_minute: float = -1.0
## Vrai si la partie est allée jusqu'au bout du temps avec plusieurs colonies en vie.
var ended_at_time: bool = false
## Minute de fin de la partie.
var end_minute: float = 0.0
