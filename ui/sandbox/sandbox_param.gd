class_name SandboxParam
extends RefCounted
## Un réglage chiffré du Bac à sable (GDD §2.1 bis) : où il se range dans SimDefs, comment
## l'afficher et ses bornes. Sert à l'écran de réglages.

enum Group { GENERAL, ZONES, TIERS, UPGRADES, ABILITIES, MUTATIONS }

## Réglages généraux : champ de SimDefs, clé du libellé, unités de la simulation par unité
## affichée, minimum, maximum et pas.
const GENERAL_FIELDS: Array[Array] = [
	["unit_cost", "SANDBOX_UNIT_COST", 1000.0, 0.001, 1_000_000.0, 0.001],
	["cell_yield", "SANDBOX_CELL_YIELD", 1000.0, 0.0, 1_000_000.0, 0.001],
	["start_stock_units", "SANDBOX_START_STOCK", 1.0, 0.0, 100_000.0, 1.0],
	["cohesion_production_pm", "SANDBOX_COHESION", 10.0, 0.0, 100.0, 0.1],
	["cohesion_production_cap_pm", "SANDBOX_COHESION_CAP", 10.0, 0.0, 1000.0, 0.1],
	["strain_bonus_pm", "SANDBOX_STRAIN", 10.0, 0.0, 1000.0, 0.1],
	["upgrade_cost_growth_pm", "SANDBOX_COST_GROWTH", 1000.0, 1.0, 10.0, 0.001],
	["cell_hp", "SANDBOX_CELL_HP", 1000.0, 0.001, 1_000_000.0, 0.001],
	["cohesion_hp_pm", "SANDBOX_COHESION_HP", 10.0, 0.0, 1000.0, 0.1],
	["regen_pm", "SANDBOX_REGEN", 10.0, 0.0, 100.0, 0.1],
	["captured_hp_pm", "SANDBOX_CAPTURED_HP", 10.0, 0.0, 100.0, 0.1],
	["turret_damage", "SANDBOX_TURRET_DAMAGE", 1000.0, 0.0, 1_000_000.0, 0.001],
	["turret_rate_pm", "SANDBOX_TURRET_RATE", 1000.0, 0.0, 100.0, 0.001],
	["turret_range", "SANDBOX_TURRET_RANGE", 1.0, 1.0, 50.0, 1.0],
	["turret_spores", "SANDBOX_TURRET_SPORES", 1.0, 1.0, 20.0, 1.0],
	["turret_hp_cells", "SANDBOX_TURRET_HP", 1.0, 1.0, 1000.0, 1.0],
	["heal_pm", "SANDBOX_HEAL", 10.0, 0.0, 1000.0, 0.1],
	["step_ticks", "SANDBOX_STEP", 1.0, 1.0, 600.0, 1.0],
	["crit_damage_pm", "SANDBOX_CRIT_DAMAGE", 1000.0, 1.0, 100.0, 0.001],
	["protection_ticks", "SANDBOX_PROTECTION", 1.0, 0.0, 1800.0, 1.0],
	["trophy_production_pm", "SANDBOX_TROPHY_PRODUCTION", 10.0, 0.0, 1000.0, 0.1],
	["trophy_enzymes", "SANDBOX_TROPHY_ENZYMES", 1.0, 0.0, 100_000.0, 1.0],
]
## Colonnes des zones et des paliers : champ (tableau de SimDefs), clé, unités, min, max, pas.
const ZONE_FIELDS: Array[Array] = [
	["zone_richness_pm", "SANDBOX_RICHNESS", 1000.0, 0.0, 1000.0, 0.001],
	["zone_free_hp_pm", "SANDBOX_ZONE_FREE_HP", 1000.0, 0.001, 1000.0, 0.001],
	["zone_defense_pm", "SANDBOX_ZONE_DEFENSE", 1000.0, 0.001, 1000.0, 0.001],
]
const TIER_FIELDS: Array[Array] = [
	["tier_cells", "SANDBOX_TIER_CELLS", 1.0, 1.0, 10_000.0, 1.0],
	["tier_production_pm", "SANDBOX_TIER_PRODUCTION", 1000.0, 0.0, 1_000_000.0, 0.001],
	["tier_enzymes", "SANDBOX_TIER_ENZYMES", 1.0, 0.0, 100_000.0, 1.0],
]
## Colonnes des améliorations et des capacités : champ de SimUpgrade ou de SimAbility, clé,
## unités, min, max, pas.
const UPGRADE_FIELDS: Array[Array] = [
	["effect", "SANDBOX_UPGRADE_EFFECT", 1.0, 0.0, 100_000.0, 1.0],
	["base_cost_units", "SANDBOX_UPGRADE_COST", 1.0, 0.0, 1_000_000.0, 1.0],
	["cost_growth_pm", "SANDBOX_UPGRADE_GROWTH", 1000.0, 0.0, 10.0, 0.001],
	["max_level", "SANDBOX_UPGRADE_MAX", 1.0, 0.0, 1000.0, 1.0],
	["unlock_tier", "SANDBOX_UNLOCK_TIER", 1.0, 0.0, 6.0, 1.0],
]
const ABILITY_FIELDS: Array[Array] = [
	["cost_enzymes", "SANDBOX_ABILITY_COST", 1.0, 0.0, 100_000.0, 1.0],
	["cooldown_ticks", "SANDBOX_ABILITY_COOLDOWN", 1.0, 0.0, 1800.0, 1.0],
	["duration_ticks", "SANDBOX_ABILITY_DURATION", 1.0, 0.0, 1800.0, 1.0],
	["unlock_tier", "SANDBOX_UNLOCK_TIER", 1.0, 0.0, 6.0, 1.0],
	["rate_pm", "SANDBOX_ABILITY_RATE", 1000.0, 0.0, 100.0, 0.001],
	["radius", "SANDBOX_ABILITY_RADIUS", 1.0, 0.0, 50.0, 1.0],
	["shots", "SANDBOX_ABILITY_SHOTS", 1.0, 0.0, 10_000.0, 1.0],
]

## Modificateurs des mutations : champ de SimMutation, clé, unités, min, max, pas. Seuls ceux
## qu'une mutation change (valeur différente de la valeur neutre) sont proposés pour elle.
const MUTATION_FIELDS: Array[Array] = [
	["damage_pm", "SANDBOX_MUT_DAMAGE", 1000.0, 0.0, 100.0, 0.001],
	["rate_pm", "SANDBOX_MUT_RATE", 1000.0, 0.0, 100.0, 0.001],
	["range_add", "SANDBOX_MUT_RANGE", 1.0, 0.0, 50.0, 1.0],
	["cohesion_pm", "SANDBOX_MUT_COHESION", 1000.0, 0.0, 100.0, 0.001],
	["regen_pm", "SANDBOX_MUT_REGEN", 1000.0, 0.0, 100.0, 0.001],
	["deep_production_pm", "SANDBOX_MUT_DEEP", 1000.0, 0.0, 100.0, 0.001],
	["free_damage_pm", "SANDBOX_MUT_FREE_DAMAGE", 1000.0, 0.0, 100.0, 0.001],
	["enemy_damage_pm", "SANDBOX_MUT_ENEMY_DAMAGE", 1000.0, 0.0, 100.0, 0.001],
	["heal_pm", "SANDBOX_MUT_HEAL", 1000.0, 0.0, 100.0, 0.001],
	["spores_add", "SANDBOX_MUT_SPORES", 1.0, 0.0, 20.0, 1.0],
	["enzymes_pm", "SANDBOX_MUT_ENZYMES", 1000.0, 0.0, 100.0, 0.001],
	["step_ticks", "SANDBOX_MUT_STEP", 1.0, 0.0, 600.0, 1.0],
	["turret_hp_pm", "SANDBOX_MUT_TURRET_HP", 1000.0, 0.0, 100.0, 0.001],
	["toxic_ticks", "SANDBOX_MUT_TOXIC", 1.0, 0.0, 600.0, 1.0],
	["cost_pm", "SANDBOX_MUT_COST", 1000.0, 0.0, 100.0, 0.001],
]

## Identifiant stable (« unit_cost », « zone_free_hp_pm.3 », « damage.effect »).
var id: String = ""
var group: Group = Group.GENERAL
## Clé de traduction du libellé (pour une ligne de tableau : celle de la colonne).
var label_key: String = ""
## Champ de SimDefs (ou de l'élément de contenu), et ligne du tableau (−1 : réglage simple).
var property: StringName = &""
var index: int = -1
## Unités de la simulation par unité affichée (1000 pour des millièmes ou des pour-mille).
var scale: float = 1.0
var low: float = 0.0
var high: float = 1.0
var step: float = 1.0


## Tous les réglages chiffrés de ces définitions, dans l'ordre de l'écran.
static func all(defs: SimDefs) -> Array[SandboxParam]:
	var list: Array[SandboxParam] = []
	for field: Array in GENERAL_FIELDS:
		list.append(_make(field, Group.GENERAL, -1))
	list.append_array(_rows(ZONE_FIELDS, Group.ZONES, defs.zone_count()))
	list.append_array(_rows(TIER_FIELDS, Group.TIERS, defs.tier_count()))
	list.append_array(_rows(UPGRADE_FIELDS, Group.UPGRADES, defs.upgrades.size()))
	list.append_array(_rows(ABILITY_FIELDS, Group.ABILITIES, defs.abilities.size()))
	list.append_array(_mutation_params(defs))
	for param: SandboxParam in list:
		if param.group == Group.UPGRADES:
			param.id = "%s.%s" % [defs.upgrades[param.index].id, param.property]
		elif param.group == Group.ABILITIES:
			param.id = "%s.%s" % [defs.abilities[param.index].id, param.property]
		elif param.group == Group.MUTATIONS:
			param.id = "%s.%s" % [defs.mutations[param.index].id, param.property]
	return list


## Modificateurs de chaque mutation qui diffèrent de la valeur neutre (celle de MutationDef).
static func _mutation_params(defs: SimDefs) -> Array[SandboxParam]:
	var list: Array[SandboxParam] = []
	var neutral := SimMutation.new()
	for row: int in range(defs.mutations.size()):
		for field: Array in MUTATION_FIELDS:
			var name: String = field[0]
			if defs.mutations[row].get(name) != neutral.get(name):
				list.append(_make(field, Group.MUTATIONS, row))
	return list


## Clés des en-têtes de colonnes d'un groupe en tableau.
static func columns(group: Group) -> Array[String]:
	var fields: Array[Array] = []
	match group:
		Group.ZONES:
			fields = ZONE_FIELDS
		Group.TIERS:
			fields = TIER_FIELDS
		Group.UPGRADES:
			fields = UPGRADE_FIELDS
		Group.ABILITIES:
			fields = ABILITY_FIELDS
	var keys: Array[String] = []
	for field: Array in fields:
		var key: String = field[1]
		keys.append(key)
	return keys


## Valeur affichée du réglage.
func read(defs: SimDefs) -> float:
	var target: Object = _target(defs)
	if group == Group.ZONES or group == Group.TIERS:
		var values: PackedInt32Array = defs.get(property)
		return float(values[index]) / scale
	var raw: int = target.get(property)
	return float(raw) / scale


## Change le réglage à partir d'une valeur affichée.
func write(defs: SimDefs, value: float) -> void:
	var raw: int = roundi(value * scale)
	if group == Group.ZONES or group == Group.TIERS:
		var values: PackedInt32Array = defs.get(property)
		values[index] = raw
		defs.set(property, values)
		return
	_target(defs).set(property, raw)


## Objet qui porte le champ : les définitions, une amélioration ou une capacité.
func _target(defs: SimDefs) -> Object:
	match group:
		Group.UPGRADES:
			return defs.upgrades[index]
		Group.ABILITIES:
			return defs.abilities[index]
		Group.MUTATIONS:
			return defs.mutations[index]
	return defs


static func _rows(fields: Array[Array], row_group: Group, count: int) -> Array[SandboxParam]:
	var list: Array[SandboxParam] = []
	for row: int in range(count):
		for field: Array in fields:
			var param: SandboxParam = _make(field, row_group, row)
			param.id = "%s.%d" % [param.id, row + 1]
			list.append(param)
	return list


static func _make(field: Array, field_group: Group, row: int) -> SandboxParam:
	var param := SandboxParam.new()
	var name: String = field[0]
	param.property = StringName(name)
	param.label_key = field[1]
	param.scale = field[2]
	param.low = field[3]
	param.high = field[4]
	param.step = field[5]
	param.group = field_group
	param.index = row
	param.id = name
	return param
