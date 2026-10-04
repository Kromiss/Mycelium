class_name SandboxParam
extends RefCounted
## Un réglage chiffré du Bac à sable (GDD §2.1 bis) : où il se range dans SimDefs, comment
## l'afficher et ses bornes. Sert à l'écran de réglages et au balayage du panneau de simulations.

enum Group { ECONOMY, ZONES, TIERS, CONSTRUCTION, BUILD_TIMES, BUILDINGS }

## Réglages de chaque bâtiment (G2) : champ de SimBuilding, clé du libellé, unités par unité
## affichée, minimum et maximum. La règle de pose n'est pas réglable (partout en G2).
const BUILDING_FIELDS: Array[Array] = [
	["cost_units", "SANDBOX_BUILDING_COST", 1.0, 0.0, 10_000.0],
	["cost_enzymes", "SANDBOX_BUILDING_COST_ENZYMES", 1.0, 0.0, 10_000.0],
	["unlock_tier", "SANDBOX_BUILDING_TIER", 1.0, 0.0, 6.0],
	["max_count", "SANDBOX_BUILDING_MAX", 1.0, 0.0, 1_000.0],
	["yield_bonus_pm", "SANDBOX_BUILDING_YIELD", 10.0, 0.0, 10_000.0],
	["enzymes_per_minute", "SANDBOX_BUILDING_ENZYMES", 1.0, 0.0, 100_000.0],
	["neighbor_bonus_pm", "SANDBOX_BUILDING_NEIGHBOR", 10.0, 0.0, 1_000.0],
	["neighbor_bonus_max_pm", "SANDBOX_BUILDING_NEIGHBOR_MAX", 10.0, 0.0, 1_000.0],
	["rosace_bonus_pm", "SANDBOX_BUILDING_ROSACE", 10.0, 0.0, 1_000.0],
	["stock_minutes", "SANDBOX_BUILDING_STOCK", 1.0, 0.0, 1_000.0],
	["growth_reduction_pm", "SANDBOX_BUILDING_GROWTH", 10.0, 0.0, 99.0],
	["effect_radius", "SANDBOX_BUILDING_RADIUS", 1.0, 0.0, 50.0],
	["extra_sites", "SANDBOX_BUILDING_SITES", 1.0, 0.0, 20.0],
	["extra_growths", "SANDBOX_BUILDING_GROWTHS", 1.0, 0.0, 20.0],
]

## Identifiant stable (« unit_cost », « zone_cost_pm.3 »).
var id: String = ""
var group: Group = Group.ECONOMY
## Clé de traduction du libellé (pour une zone ou un palier : celle de la colonne).
var label_key: String = ""
## Champ de SimDefs, et index dans ce champ s'il s'agit d'un tableau (−1 sinon). Pour un
## bâtiment : champ de SimBuilding, et index du bâtiment dans SimDefs.buildings.
var property: StringName = &""
var index: int = -1
## Clé du nom du bâtiment (groupe BUILDINGS).
var building_key: String = ""
## Unités de la simulation par unité affichée (1000 pour des millièmes ou des pour-mille).
var scale: float = 1.0
var low: float = 0.0
var high: float = 1.0
var step: float = 1.0


## Tous les réglages chiffrés, dans l'ordre de l'écran. « buildings » : bâtiments de la partie
## (aucun réglage de bâtiment si la liste est vide).
static func all(
	zone_count: int, tier_count: int, buildings: Array[SimBuilding] = []
) -> Array[SandboxParam]:
	var list: Array[SandboxParam] = [
		_make("SANDBOX_UNIT_COST", &"unit_cost", 1000.0, 0.001, 1_000_000.0, 0.001),
		_make("SANDBOX_CELL_YIELD", &"cell_yield", 1000.0, 0.0, 1_000_000.0, 0.001),
		_make("SANDBOX_GROWTH", &"base_growth_ticks", 1.0, 1.0, 600.0, 1.0),
		_make("SANDBOX_START_STOCK", &"start_stock_units", 1.0, 0.0, 100_000.0, 1.0),
		_make("SANDBOX_COST_GROWTH", &"colonize_cost_growth_pm", 1000.0, 1.0, 5.0, 0.001),
		_make("SANDBOX_COHESION", &"cohesion_per_neighbor_pm", 10.0, 0.0, 100.0, 0.1),
		_make("SANDBOX_MAX_GROWTHS", &"max_growths", 1.0, 1.0, 20.0, 1.0),
		_make("SANDBOX_QUEUE", &"expansion_queue_size", 1.0, 1.0, 50.0, 1.0),
	]
	var zone_keys: Array[String] = ["SANDBOX_RICHNESS", "SANDBOX_ZONE_COST", "SANDBOX_ZONE_GROWTH"]
	var zone_fields: Array[StringName] = [&"zone_richness_pm", &"zone_cost_pm", &"zone_growth_pm"]
	for zone: int in range(zone_count):
		for column: int in range(zone_keys.size()):
			var param: SandboxParam = _make(
				zone_keys[column], zone_fields[column], 1000.0, 0.0, 1000.0, 0.001
			)
			param.group = Group.ZONES
			param.index = zone
			param.id = "%s.%d" % [param.id, zone + 1]
			list.append(param)
	for tier: int in range(tier_count):
		var cells: SandboxParam = _make(
			"SANDBOX_TIER_CELLS", &"tier_cells", 1.0, 1.0, 10_000.0, 1.0
		)
		var production: SandboxParam = _make(
			"SANDBOX_TIER_PRODUCTION", &"tier_production_pm", 1000.0, 0.0, 1_000_000.0, 0.001
		)
		for param: SandboxParam in [cells, production]:
			param.group = Group.TIERS
			param.index = tier
			param.id = "%s.%d" % [param.id, tier + 1]
			list.append(param)
	list.append_array(_construction_params())
	list.append_array(_building_params(buildings))
	return list


## Réglages généraux des bâtiments (G2) : plafond du stock, pousses, chantiers, file, coûts,
## remboursement et durées des chantiers selon le palier de déblocage.
static func _construction_params() -> Array[SandboxParam]:
	var list: Array[SandboxParam] = [
		_make("SANDBOX_STOCK_CAP", &"stock_cap_seconds", 1.0, 0.0, 100_000.0, 1.0),
		_make("SANDBOX_MAX_GROWTHS_CAP", &"max_growths_cap", 1.0, 1.0, 20.0, 1.0),
		_make("SANDBOX_BASE_SITES", &"base_build_sites", 1.0, 1.0, 20.0, 1.0),
		_make("SANDBOX_MAX_SITES", &"max_build_sites", 1.0, 1.0, 20.0, 1.0),
		_make("SANDBOX_BUILD_QUEUE", &"build_queue_size", 1.0, 1.0, 50.0, 1.0),
		_make("SANDBOX_BUILDING_COST_GROWTH", &"building_cost_growth_pm", 1000.0, 1.0, 5.0, 0.001),
		_make("SANDBOX_DEMOLISH_REFUND", &"demolish_refund_pm", 10.0, 0.0, 100.0, 0.1),
	]
	for param: SandboxParam in list:
		param.group = Group.CONSTRUCTION
	for tier: int in range(6):
		var time: SandboxParam = _make(
			"SANDBOX_BUILD_TIME", &"build_ticks_by_tier", 1.0, 1.0, 600.0, 1.0
		)
		time.group = Group.BUILD_TIMES
		time.index = tier
		time.id = "%s.%d" % [time.id, tier]
		list.append(time)
	return list


## Réglages de chaque bâtiment (G2), rangés champ par champ.
static func _building_params(buildings: Array[SimBuilding]) -> Array[SandboxParam]:
	var list: Array[SandboxParam] = []
	for field: Array in BUILDING_FIELDS:
		var name: String = field[0]
		var key: String = field[1]
		var units: float = field[2]
		var minimum: float = field[3]
		var maximum: float = field[4]
		for index: int in range(buildings.size()):
			var param: SandboxParam = _make(
				key, StringName(name), units, minimum, maximum, 1.0 / units
			)
			param.group = Group.BUILDINGS
			param.index = index
			param.building_key = buildings[index].name_key
			param.id = "%s.%s" % [buildings[index].id, name]
			list.append(param)
	return list


## Valeur affichée du réglage.
func read(defs: SimDefs) -> float:
	if group == Group.BUILDINGS:
		var stored: int = defs.buildings[index].get(property)
		return float(stored) / scale
	if index < 0:
		var raw: int = defs.get(property)
		return float(raw) / scale
	var values: PackedInt32Array = defs.get(property)
	return float(values[index]) / scale


## Change le réglage à partir d'une valeur affichée.
func write(defs: SimDefs, value: float) -> void:
	var raw: int = roundi(value * scale)
	if group == Group.BUILDINGS:
		defs.buildings[index].set(property, raw)
		return
	if index < 0:
		defs.set(property, raw)
		return
	var values: PackedInt32Array = defs.get(property)
	values[index] = raw
	defs.set(property, values)


## Libellé complet traduit (« Zone 3 · Coût × », « Palier 2 · Cases poussées »).
func label() -> String:
	var name: String = TranslationServer.translate(label_key)
	match group:
		Group.ZONES:
			return "%s %d · %s" % [TranslationServer.translate("SANDBOX_ZONE"), index + 1, name]
		Group.TIERS:
			return "%s %d · %s" % [TranslationServer.translate("SANDBOX_TIER"), index + 1, name]
		Group.BUILD_TIMES:
			return name % index
		Group.BUILDINGS:
			return "%s · %s" % [TranslationServer.translate(building_key), name]
	return name


static func _make(
	key: String, field: StringName, units: float, minimum: float, maximum: float, increment: float
) -> SandboxParam:
	var param := SandboxParam.new()
	param.label_key = key
	param.property = field
	param.scale = units
	param.low = minimum
	param.high = maximum
	param.step = increment
	param.id = String(field)
	return param
