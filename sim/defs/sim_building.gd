class_name SimBuilding
extends SimRecord
## Copie d'un bâtiment (BuildingDef) pour la simulation.

var id: StringName = &""
var name_key: String = ""
var kind: int = BuildingDef.Kind.SWARMER
var unlock_tier: int = 1
var cost_enzymes: int = 10
var build_ticks: int = 5
var reach: int = 2
var damage_pm: int = 1000
var rate_pm: int = 1000
var hp: int = 120_000


func fields() -> PackedStringArray:
	return PackedStringArray(
		[
			"id",
			"name_key",
			"kind",
			"unlock_tier",
			"cost_enzymes",
			"build_ticks",
			"reach",
			"damage_pm",
			"rate_pm",
			"hp",
		]
	)


static func from_def(def: BuildingDef) -> SimBuilding:
	var building := SimBuilding.new()
	building.copy_from(def)
	return building


static func from_dict(data: Dictionary) -> SimBuilding:
	var building := SimBuilding.new()
	building.read_dict(data)
	return building
