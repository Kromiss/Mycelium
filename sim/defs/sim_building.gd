class_name SimBuilding
extends RefCounted
## Un bâtiment tel que la simulation le lit : copie en entiers d'un BuildingDef (Architecture §5),
## modifiable par partie (Bac à sable) sans toucher aux fichiers de data/.

## Champs entiers copiés tels quels entre BuildingDef, SimBuilding et les dictionnaires.
const INT_FIELDS: Array[String] = [
	"unlock_tier",
	"cost_units",
	"cost_enzymes",
	"placement",
	"max_count",
	"yield_bonus_pm",
	"enzymes_per_minute",
	"neighbor_bonus_pm",
	"neighbor_bonus_max_pm",
	"rosace_bonus_pm",
	"stock_minutes",
	"growth_reduction_pm",
	"effect_radius",
	"extra_sites",
	"extra_growths",
]

var id: StringName = &""
var name_key: String = ""
var unlock_tier: int = 0
var cost_units: int = 1
var cost_enzymes: int = 0
var placement: int = BuildingDef.Placement.ANYWHERE
var max_count: int = 0
var yield_bonus_pm: int = 0
var enzymes_per_minute: int = 0
var neighbor_bonus_pm: int = 0
var neighbor_bonus_max_pm: int = 0
var rosace_bonus_pm: int = 0
var stock_minutes: int = 0
var growth_reduction_pm: int = 0
var effect_radius: int = 0
var extra_sites: int = 0
var extra_growths: int = 0


## Copie d'une définition de data/.
static func from_def(def: BuildingDef) -> SimBuilding:
	var building := SimBuilding.new()
	building.id = def.id
	building.name_key = def.name_key
	for field: String in INT_FIELDS:
		var value: int = def.get(field)
		building.set(field, value)
	return building


## Vrai si le bâtiment se désactive quand la colonie perd son palier (GDD §7.6).
func can_deactivate() -> bool:
	return unlock_tier > 0


func to_dict() -> Dictionary:
	var data: Dictionary = {"id": String(id), "name_key": name_key}
	for field: String in INT_FIELDS:
		data[field] = get(field)
	return data


static func from_dict(data: Dictionary) -> SimBuilding:
	var building := SimBuilding.new()
	building.id = StringName(str(data.get("id", "")))
	building.name_key = str(data.get("name_key", ""))
	for field: String in INT_FIELDS:
		building.set(field, DictRead.get_int(data, field))
	return building
