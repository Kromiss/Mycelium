class_name GameText
extends RefCounted
## Textes de l'écran de partie construits à partir de l'état (noms des colonies, effets des
## améliorations, état des capacités). Les chiffres viennent de la simulation.

const COLORS: ColonyColors = preload("res://data/colors.tres")
## Couleurs des colonies, dans l'ordre des numéros de colonie (la première est celle du joueur
## en Bac à sable, GDD §2.1 bis).
const COLONY_COLORS: Array[String] = [
	"COLOR_MINT", "COLOR_CORAL", "COLOR_SKY", "COLOR_APRICOT", "COLOR_LAVENDER", "COLOR_CANDY"
]


## Rang de la couleur d'une colonie dans data/colors.tres.
static func color_index(colony_id: int) -> int:
	return COLORS.index_of(COLONY_COLORS[colony_id % COLONY_COLORS.size()])


## Nom d'une colonie pour le joueur : « Toi » pour la sienne, sinon le nom de sa couleur.
static func colony_name(colony_id: int, local_colony: int) -> String:
	if colony_id == local_colony:
		return _t("HUD_YOU")
	return _t(COLORS.names[color_index(colony_id)])


## Effet d'une amélioration : effet d'un niveau et valeur avant → après (« +25 % par niveau ·
## 42 → 45 »). « values » : [avant, après] (Simulation.upgrade_values()).
static func upgrade_effect(upgrade: SimUpgrade, values: PackedInt64Array) -> String:
	var key: String = "EFFECT_" + String(upgrade.id).to_upper()
	var per_level: String = _stat_text(upgrade.stat, upgrade.effect, true)
	var before: String = _stat_text(upgrade.stat, values[0], false)
	var after: String = _stat_text(upgrade.stat, values[1], false)
	return _t(key) % [per_level, before, after]


## Valeur d'une statistique, dans l'unité de l'effet affiché. « per_level » : effet d'un
## niveau (en pour-cent pour les statistiques en pour-mille).
static func _stat_text(stat: int, value: int, per_level: bool) -> String:
	match stat:
		UpgradeDef.Stat.DAMAGE, UpgradeDef.Stat.HEAL, UpgradeDef.Stat.TURRET_HP:
			return percent(value) if per_level else NumberFormat.amount(value)
		UpgradeDef.Stat.RATE:
			return percent(value) if per_level else NumberFormat.decimal(_round_tenth(value))
		UpgradeDef.Stat.YIELD:
			return percent(value) if per_level else NumberFormat.rate(value)
		UpgradeDef.Stat.CELL_HP:
			return percent(value) if per_level else NumberFormat.multiplier(value)
		UpgradeDef.Stat.REGEN, UpgradeDef.Stat.SPLASH, UpgradeDef.Stat.CRIT:
			return percent(value)
	return str(value)


## Pour-mille écrits en pour-cent (« 25 », « 2,5 »).
static func percent(per_mille: int) -> String:
	return NumberFormat.decimal(per_mille * 100)


## Arrondi au dixième d'une valeur en millièmes (cadences).
static func _round_tenth(milli: int) -> int:
	return Fixed.div_round(milli, 100) * 100


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
