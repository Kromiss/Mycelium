class_name SimReport
extends RefCounted
## Tableaux des mesures d'un lot de simulations (GDD §18.5). Pour chaque série : les mesures
## de la partie (une colonne), puis celles de chaque secteur occupé (une colonne par secteur).
## Chaque case donne la moyenne, le minimum, le maximum et l'écart type sur les parties de la
## série. Exportable en CSV.


## Une ligne de tableau : son libellé (traduit) et les statistiques de chaque colonne.
class Row:
	extends RefCounted
	var label: String = ""
	var stats: Array[SimStats] = []


## Courbes possibles (production ou cases, par minute).
enum CurveKind { PRODUCTION, CELLS }

const STAT_KEYS: Array[String] = ["SIM_STAT_MEAN", "SIM_STAT_MIN", "SIM_STAT_MAX", "SIM_STAT_STD"]


## Mesures de la partie : éliminations, minute de la première, parties finies au temps, durée.
static func game_rows(one: SimRunner.Series) -> Array[Row]:
	var rows: Array[Row] = []
	rows.append(_game_row(one, _t("SIM_M_ELIMINATIONS"), _game.bind(0)))
	rows.append(_game_row(one, _t("SIM_M_FIRST_ELIMINATION"), _game.bind(1)))
	rows.append(_game_row(one, _t("SIM_M_ENDED_AT_TIME"), _game.bind(2)))
	rows.append(_game_row(one, _t("SIM_M_END"), _game.bind(3)))
	return rows


## Mesures de chaque secteur occupé (une statistique par secteur). « with_minutes » ajoute
## la production et les cases de chaque minute (pour le CSV).
static func colony_rows(one: SimRunner.Series, with_minutes: bool) -> Array[Row]:
	var rows: Array[Row] = []
	var sample: SimRunResult = _sample(one)
	if sample == null:
		return rows
	var first: SimColonyResult = sample.colonies[0]
	rows.append(_row(one, _t("SIM_M_WINS"), _final.bind(0)))
	rows.append(_row(one, _t("SIM_M_RANK"), _final.bind(1)))
	rows.append(_row(one, _t("SIM_M_ELIMINATED"), _final.bind(2)))
	rows.append(_row(one, _t("SIM_M_ELIMINATED_AT"), _final.bind(3)))
	rows.append(_row(one, _t("SIM_M_TROPHIES"), _final.bind(4)))
	rows.append(_row(one, _t("SIM_M_CELLS"), _final.bind(5)))
	rows.append(_row(one, _t("SIM_M_CAPTURED"), _final.bind(6)))
	rows.append(_row(one, _t("SIM_M_CAPTURED_PER_MINUTE"), _final.bind(7)))
	rows.append(_row(one, _t("SIM_M_FINAL_TIER"), _final.bind(8)))
	rows.append(_row(one, _t("SIM_M_PRODUCTION"), _final.bind(9)))
	rows.append(_row(one, _t("SIM_M_PEAK"), _final.bind(10)))
	rows.append(_row(one, _t("SIM_M_BIOMASS"), _final.bind(11)))
	for zone: int in range(1, first.zone_minutes.size()):
		rows.append(_row(one, _t("SIM_M_ZONE") % (zone + 1), _zone.bind(zone)))
	for tier: int in range(first.tier_minutes.size()):
		rows.append(_row(one, _t("SIM_M_TIER") % (tier + 1), _tier.bind(tier)))
	for index: int in range(first.upgrade_levels.size()):
		var name: String = _t(one.defs.upgrades[index].name_key)
		rows.append(_row(one, _t("SIM_M_LEVEL") % name, _level.bind(index)))
	if with_minutes:
		for minute: int in range(_minutes_count(one)):
			rows.append(_row(one, _t("SIM_M_MINUTE") % (minute + 1), _minute.bind(minute, 0)))
		for minute: int in range(_minutes_count(one)):
			rows.append(_row(one, _t("SIM_M_MINUTE_CELLS") % (minute + 1), _minute.bind(minute, 1)))
	return rows


## Courbe moyenne d'un secteur (rang de colonne) : production (nutriments par seconde) ou cases,
## une valeur par minute.
static func mean_curve(one: SimRunner.Series, column: int, curve: CurveKind) -> PackedFloat64Array:
	var values := PackedFloat64Array()
	for minute: int in range(_minutes_count(one)):
		var measure: Callable = _minute.bind(minute, int(curve))
		values.append(SimStats.of(_values(one, column, measure)).mean)
	return values


## Texte CSV, une ligne par mesure et par colonne : « série, secteur, profil, mesure, moyenne,
## min, max, écart type, parties ». Les mesures de la partie ont un secteur vide.
static func to_csv(series: Array[SimRunner.Series]) -> String:
	var lines := PackedStringArray()
	var header := PackedStringArray()
	for key: String in ["SIM_CSV_SERIES", "SIM_CSV_SECTOR", "SIM_CSV_PROFILE", "SIM_CSV_MEASURE"]:
		header.append(_cell(_t(key)))
	for key: String in STAT_KEYS:
		header.append(_cell(_t(key)))
	header.append(_cell(_t("SIM_STAT_COUNT")))
	lines.append(",".join(header))
	for one: SimRunner.Series in series:
		for row: Row in game_rows(one):
			lines.append(_csv_line(one.label(), "", "", row.label, row.stats[0]))
		var sectors: PackedInt32Array = one.sectors()
		for row: Row in colony_rows(one, true):
			for column: int in range(row.stats.size()):
				var sector: int = sectors[column]
				var profile: String = RobotCatalog.label(one.profiles[sector])
				lines.append(
					_csv_line(one.label(), str(sector + 1), profile, row.label, row.stats[column])
				)
	return "\n".join(lines) + "\n"


## Valeur d'une statistique : 0 moyenne, 1 minimum, 2 maximum, 3 écart type.
static func pick(stats: SimStats, stat: int) -> float:
	match stat:
		1:
			return stats.minimum
		2:
			return stats.maximum
		3:
			return stats.deviation
	return stats.mean


static func _csv_line(
	series: String, sector: String, profile: String, measure: String, stats: SimStats
) -> String:
	var line := PackedStringArray([_cell(series), sector, _cell(profile), _cell(measure)])
	for stat: int in range(STAT_KEYS.size()):
		line.append(_number(pick(stats, stat)))
	line.append("%d/%d" % [stats.count, stats.total])
	return ",".join(line)


static func _sample(one: SimRunner.Series) -> SimRunResult:
	for result: SimRunResult in one.results:
		if result != null and not result.colonies.is_empty():
			return result
	return null


static func _minutes_count(one: SimRunner.Series) -> int:
	var count: int = 0
	for result: SimRunResult in one.results:
		if result != null:
			for colony: SimColonyResult in result.colonies:
				count = maxi(count, colony.production_per_minute.size())
	return count


static func _game_row(one: SimRunner.Series, label: String, measure: Callable) -> Row:
	var row := Row.new()
	row.label = label
	var values := PackedFloat64Array()
	for result: SimRunResult in one.results:
		if result != null:
			var value: float = measure.call(result)
			values.append(value)
	row.stats.append(SimStats.of(values))
	return row


static func _row(one: SimRunner.Series, label: String, measure: Callable) -> Row:
	var row := Row.new()
	row.label = label
	for column: int in range(one.sectors().size()):
		row.stats.append(SimStats.of(_values(one, column, measure)))
	return row


## Valeurs d'une mesure de colonie pour la colonne « column », sur toutes les parties.
static func _values(one: SimRunner.Series, column: int, measure: Callable) -> PackedFloat64Array:
	var values := PackedFloat64Array()
	for result: SimRunResult in one.results:
		if result != null and column < result.colonies.size():
			var value: float = measure.call(result.colonies[column])
			values.append(value)
	return values


## Mesures de la partie : 0 éliminations, 1 minute de la première, 2 finie au temps (%),
## 3 minute de fin.
static func _game(result: SimRunResult, kind: int) -> float:
	var values: Array[float] = [
		float(result.eliminations),
		result.first_elimination_minute,
		100.0 if result.ended_at_time else 0.0,
		result.end_minute,
	]
	return values[kind]


static func _final(colony: SimColonyResult, kind: int) -> float:
	var captured_per_minute: float = colony.cells_captured / maxf(1.0 / 60.0, colony.minutes_alive)
	var values: Array[float] = [
		100.0 if colony.rank == 1 else 0.0,
		float(colony.rank),
		0.0 if colony.eliminated_minute < 0.0 else 100.0,
		colony.eliminated_minute,
		float(colony.trophies),
		float(colony.final_cells),
		float(colony.cells_captured),
		captured_per_minute,
		float(colony.final_tier),
		colony.final_production,
		colony.peak_production,
		colony.biomass,
	]
	return values[kind]


static func _zone(colony: SimColonyResult, zone: int) -> float:
	return colony.zone_minutes[zone]


static func _tier(colony: SimColonyResult, tier: int) -> float:
	return colony.tier_minutes[tier]


static func _level(colony: SimColonyResult, index: int) -> float:
	return float(colony.upgrade_levels[index])


## Production (0) ou cases (1) d'une minute ; −1 si la partie était finie.
static func _minute(colony: SimColonyResult, minute: int, kind: int) -> float:
	var values: PackedFloat64Array = (
		colony.production_per_minute if kind == 0 else colony.cells_per_minute
	)
	if minute >= values.size():
		return -1.0
	return values[minute]


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
