class_name SandboxParam
extends RefCounted
## Un réglage chiffré du Bac à sable (GDD §2.1 bis) : où il se range dans SimDefs, comment
## l'afficher et ses bornes. Sert à l'écran de réglages et au balayage du panneau de simulations.

enum Group { ECONOMY, ZONES, TIERS }

## Identifiant stable (« unit_cost », « zone_cost_pm.3 »).
var id: String = ""
var group: Group = Group.ECONOMY
## Clé de traduction du libellé (pour une zone ou un palier : celle de la colonne).
var label_key: String = ""
## Champ de SimDefs, et index dans ce champ s'il s'agit d'un tableau (−1 sinon).
var property: StringName = &""
var index: int = -1
## Unités de la simulation par unité affichée (1000 pour des millièmes ou des pour-mille).
var scale: float = 1.0
var low: float = 0.0
var high: float = 1.0
var step: float = 1.0


## Tous les réglages chiffrés, dans l'ordre de l'écran.
static func all(zone_count: int, tier_count: int) -> Array[SandboxParam]:
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
	return list


## Valeur affichée du réglage.
func read(defs: SimDefs) -> float:
	if index < 0:
		var raw: int = defs.get(property)
		return float(raw) / scale
	var values: PackedInt32Array = defs.get(property)
	return float(values[index]) / scale


## Change le réglage à partir d'une valeur affichée.
func write(defs: SimDefs, value: float) -> void:
	var raw: int = roundi(value * scale)
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
