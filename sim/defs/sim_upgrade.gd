class_name SimUpgrade
extends SimRecord
## Copie d'une amélioration (UpgradeDef) pour la simulation.

var id: StringName = &""
var name_key: String = ""
var tab: int = UpgradeDef.Tab.ATTACK
var stat: int = UpgradeDef.Stat.DAMAGE
var effect: int = 0
var base_cost_units: int = 1
var cost_growth_pm: int = 0
var max_level: int = 0
var unlock_tier: int = 0


func fields() -> PackedStringArray:
	return PackedStringArray(
		[
			"id",
			"name_key",
			"tab",
			"stat",
			"effect",
			"base_cost_units",
			"cost_growth_pm",
			"max_level",
			"unlock_tier",
		]
	)


static func from_def(def: UpgradeDef) -> SimUpgrade:
	var upgrade := SimUpgrade.new()
	upgrade.copy_from(def)
	return upgrade


static func from_dict(data: Dictionary) -> SimUpgrade:
	var upgrade := SimUpgrade.new()
	upgrade.read_dict(data)
	return upgrade
