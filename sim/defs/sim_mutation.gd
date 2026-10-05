class_name SimMutation
extends SimRecord
## Copie d'une mutation (MutationDef) pour la simulation.

var id: StringName = &""
var name_key: String = ""
var desc_key: String = ""
var damage_pm: int = 1000
var rate_pm: int = 1000
var range_add: int = 0
var building_range_add: int = 0
var cohesion_pm: int = 1000
var regen_pm: int = 1000
var deep_production_pm: int = 1000
var free_damage_pm: int = 1000
var enemy_damage_pm: int = 1000
var heal_pm: int = 1000
var spores_add: int = 0
var enzymes_pm: int = 1000
var turret_hp_pm: int = 1000
var toxic_ticks: int = 0
var cost_pm: int = 1000


func fields() -> PackedStringArray:
	return PackedStringArray(
		[
			"id",
			"name_key",
			"desc_key",
			"damage_pm",
			"rate_pm",
			"range_add",
			"building_range_add",
			"cohesion_pm",
			"regen_pm",
			"deep_production_pm",
			"free_damage_pm",
			"enemy_damage_pm",
			"heal_pm",
			"spores_add",
			"enzymes_pm",
			"turret_hp_pm",
			"toxic_ticks",
			"cost_pm",
		]
	)


static func from_def(def: MutationDef) -> SimMutation:
	var mutation := SimMutation.new()
	mutation.copy_from(def)
	return mutation


static func from_dict(data: Dictionary) -> SimMutation:
	var mutation := SimMutation.new()
	mutation.read_dict(data)
	return mutation
