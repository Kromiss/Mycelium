class_name SimReport
extends RefCounted
## Tableau des mesures d'un lot de simulations (GDD §14.5) : une ligne par mesure, une colonne
## par série, et pour chaque case la moyenne, le minimum, le maximum et l'écart type.
## Exportable en CSV.


## Une ligne du tableau : son libellé (traduit) et les statistiques de chaque série.
class Row:
	extends RefCounted
	var label: String = ""
	var stats: Array[SimStats] = []


## Lignes du tableau. Les mesures sont des fonctions (résultat, index) liées à leur index.
## « with_minutes » ajoute la production de chaque minute (pour le CSV).
static func rows(series: Array[SimRunner.Series], with_minutes: bool) -> Array[Row]:
	var result: Array[Row] = []
	if series.is_empty() or series[0].results.is_empty():
		return result
	var sample: SimRunResult = series[0].results[0]
	for zone: int in range(1, sample.zone_minutes.size()):
		result.append(_row(series, _t("SIM_M_ZONE") % (zone + 1), _zone.bind(zone)))
	for tier: int in range(sample.tier_minutes.size()):
		result.append(_row(series, _t("SIM_M_TIER") % (tier + 1), _tier.bind(tier)))
	var thirds: Array[String] = ["SIM_THIRD_START", "SIM_THIRD_MIDDLE", "SIM_THIRD_END"]
	for third: int in range(thirds.size()):
		var name: String = _t(thirds[third])
		result.append(_row(series, _t("SIM_M_PAYBACK") % name, _payback.bind(third)))
		result.append(_row(series, _t("SIM_M_UNPAID") % name, _unpaid.bind(third)))
	result.append(_row(series, _t("SIM_M_WAIT_GROWTH"), _wait.bind(0)))
	result.append(_row(series, _t("SIM_M_WAIT_NUTRIENTS"), _wait.bind(1)))
	result.append(_row(series, _t("SIM_M_WAIT_NOTHING"), _wait.bind(2)))
	result.append(_row(series, _t("SIM_M_CELLS"), _final.bind(0)))
	result.append(_row(series, _t("SIM_M_FINAL_TIER"), _final.bind(1)))
	result.append(_row(series, _t("SIM_M_PRODUCTION"), _final.bind(2)))
	result.append(_row(series, _t("SIM_M_PEAK"), _final.bind(3)))
	result.append(_row(series, _t("SIM_M_BIOMASS"), _final.bind(4)))
	if with_minutes:
		for minute: int in range(sample.production_per_minute.size()):
			result.append(_row(series, _t("SIM_M_MINUTE") % (minute + 1), _minute.bind(minute)))
	return result


## Production moyenne de chaque minute pour une série (nutriments par seconde), pour les courbes.
static func mean_curve(one: SimRunner.Series) -> PackedFloat64Array:
	var curve := PackedFloat64Array()
	if one.results.is_empty():
		return curve
	for minute: int in range(one.results[0].production_per_minute.size()):
		curve.append(SimStats.of(_values(one, _minute.bind(minute))).mean)
	return curve


## Texte CSV : « mesure,statistique,série 1,série 2… », une ligne par statistique.
static func to_csv(series: Array[SimRunner.Series]) -> String:
	var lines := PackedStringArray()
	var header := PackedStringArray([_cell(_t("SIM_CSV_MEASURE")), _cell(_t("SIM_CSV_STAT"))])
	for one: SimRunner.Series in series:
		header.append(_cell(one.label()))
	lines.append(",".join(header))
	var names: Array[String] = ["SIM_STAT_MEAN", "SIM_STAT_MIN", "SIM_STAT_MAX", "SIM_STAT_STD"]
	for row: Row in rows(series, true):
		for stat: int in range(names.size()):
			var line := PackedStringArray([_cell(row.label), _cell(_t(names[stat]))])
			for stats: SimStats in row.stats:
				line.append(_number(_pick(stats, stat)))
			lines.append(",".join(line))
		var reached := PackedStringArray([_cell(row.label), _cell(_t("SIM_STAT_COUNT"))])
		for stats: SimStats in row.stats:
			reached.append("%d/%d" % [stats.count, stats.total])
		lines.append(",".join(reached))
	return "\n".join(lines) + "\n"


## Valeur d'une statistique : 0 moyenne, 1 minimum, 2 maximum, 3 écart type.
static func _pick(stats: SimStats, stat: int) -> float:
	match stat:
		1:
			return stats.minimum
		2:
			return stats.maximum
		3:
			return stats.deviation
	return stats.mean


static func _row(series: Array[SimRunner.Series], label: String, measure: Callable) -> Row:
	var row := Row.new()
	row.label = label
	for one: SimRunner.Series in series:
		row.stats.append(SimStats.of(_values(one, measure)))
	return row


static func _values(one: SimRunner.Series, measure: Callable) -> PackedFloat64Array:
	var values := PackedFloat64Array()
	for result: SimRunResult in one.results:
		if result != null:
			var value: float = measure.call(result)
			values.append(value)
	return values


static func _zone(result: SimRunResult, zone: int) -> float:
	return result.zone_minutes[zone]


static func _tier(result: SimRunResult, tier: int) -> float:
	return result.tier_minutes[tier]


static func _payback(result: SimRunResult, third: int) -> float:
	return result.payback_seconds[third]


static func _unpaid(result: SimRunResult, third: int) -> float:
	return float(result.unpaid_cells[third])


## Parts du temps en pour-cent.
static func _wait(result: SimRunResult, kind: int) -> float:
	var shares: Array[float] = [
		result.waiting_growth, result.waiting_nutrients, result.waiting_nothing
	]
	return shares[kind] * 100.0


static func _final(result: SimRunResult, kind: int) -> float:
	var values: Array[float] = [
		float(result.final_cells),
		float(result.final_tier),
		result.final_production,
		result.peak_production,
		result.biomass,
	]
	return values[kind]


static func _minute(result: SimRunResult, minute: int) -> float:
	if minute >= result.production_per_minute.size():
		return -1.0
	return result.production_per_minute[minute]


## Nombre écrit avec un point décimal, vide si la mesure n'existe pas.
static func _number(value: float) -> String:
	if value < 0.0:
		return ""
	return String.num(value, 3)


## Case de texte CSV, entre guillemets si besoin.
static func _cell(text: String) -> String:
	if text.contains(",") or text.contains('"') or text.contains("\n"):
		return '"%s"' % text.replace('"', '""')
	return text


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
