class_name SimMutation
extends SimRecord
## Copie d'une mutation (MutationDef) pour la simulation.

var id: StringName = &""
var name_key: String = ""
var desc_key: String = ""
var cohesion_pm: int = 1000
var regen_pm: int = 1000
var deep_production_pm: int = 1000
var enzymes_pm: int = 1000
var turret_hp_pm: int = 1000
var cost_pm: int = 1000


func fields() -> PackedStringArray:
	return PackedStringArray(
		[
			"id",
			"name_key",
			"desc_key",
			"cohesion_pm",
			"regen_pm",
			"deep_production_pm",
			"enzymes_pm",
			"turret_hp_pm",
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
