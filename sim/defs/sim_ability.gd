class_name SimAbility
extends SimRecord
## Copie d'une capacité active (AbilityDef) pour la simulation.

var id: StringName = &""
var name_key: String = ""
var kind: int = AbilityDef.Kind.SALVO
var cost_enzymes: int = 20
var cooldown_ticks: int = 90
var duration_ticks: int = 10
var unlock_tier: int = 1
var rate_pm: int = 1000
var radius: int = 0
var shots: int = 0


func fields() -> PackedStringArray:
	return PackedStringArray(
		[
			"id",
			"name_key",
			"kind",
			"cost_enzymes",
			"cooldown_ticks",
			"duration_ticks",
			"unlock_tier",
			"rate_pm",
			"radius",
			"shots",
		]
	)


static func from_def(def: AbilityDef) -> SimAbility:
	var ability := SimAbility.new()
	ability.copy_from(def)
	return ability


static func from_dict(data: Dictionary) -> SimAbility:
	var ability := SimAbility.new()
	ability.read_dict(data)
	return ability
