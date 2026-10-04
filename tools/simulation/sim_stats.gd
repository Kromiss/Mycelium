class_name SimStats
extends RefCounted
## Moyenne, minimum, maximum et écart type d'une mesure sur plusieurs parties (GDD §14.5).
## Les valeurs négatives (« jamais atteint ») sont écartées et comptées à part.

var mean: float = 0.0
var minimum: float = 0.0
var maximum: float = 0.0
## Écart type de la population (les parties d'une série sont toutes les parties mesurées).
var deviation: float = 0.0
## Nombre de parties où la mesure existe, et nombre total de parties.
var count: int = 0
var total: int = 0


## Statistiques d'une liste de valeurs.
static func of(values: PackedFloat64Array) -> SimStats:
	var stats := SimStats.new()
	stats.total = values.size()
	var kept := PackedFloat64Array()
	for value: float in values:
		if value >= 0.0:
			kept.append(value)
	stats.count = kept.size()
	if kept.is_empty():
		stats.mean = -1.0
		stats.minimum = -1.0
		stats.maximum = -1.0
		stats.deviation = -1.0
		return stats
	stats.minimum = kept[0]
	stats.maximum = kept[0]
	var sum: float = 0.0
	for value: float in kept:
		sum += value
		stats.minimum = minf(stats.minimum, value)
		stats.maximum = maxf(stats.maximum, value)
	stats.mean = sum / kept.size()
	var squares: float = 0.0
	for value: float in kept:
		squares += (value - stats.mean) * (value - stats.mean)
	stats.deviation = sqrt(squares / kept.size())
	return stats
