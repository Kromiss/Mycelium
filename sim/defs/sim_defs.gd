class_name SimDefs
extends RefCounted
## Tous les chiffres dont une partie a besoin, copiés depuis les ressources de data/ au
## lancement (Architecture §5). Le Bac à sable et la partie personnalisée modifient ces
## copies, jamais les fichiers. La simulation ne lit rien d'autre pendant les ticks.
## Les quantités sont en millièmes, les multiplicateurs en pour-mille.

const ZONES_PATH: String = "res://data/zones.tres"
const TIERS_PATH: String = "res://data/tiers.tres"
const BALANCE_PATH: String = "res://data/balance.tres"

# --- Forêt (mode) ---
## Identifiant du mode dont la forêt est tirée (« duel », « ffa »).
var mode_id: StringName = &""
## Nombre de secteurs de la forêt (2, 3 ou 6).
var sectors: int = 2
## Épaisseur de chaque zone, en anneaux.
var rings_per_zone: int = 2

# --- Zones (index 0 = zone 1, au bord) ---
var zone_richness_pm: PackedInt32Array = PackedInt32Array()
var zone_cost_pm: PackedInt32Array = PackedInt32Array()
var zone_growth_pm: PackedInt32Array = PackedInt32Array()
var zone_capture_pm: PackedInt32Array = PackedInt32Array()

# --- Paliers (index 0 = palier 1) ---
var tier_cells: PackedInt32Array = PackedInt32Array()
var tier_production_pm: PackedInt32Array = PackedInt32Array()

# --- Économie ---
var unit_cost: int = 0
var cell_yield: int = 0
var base_growth_ticks: int = 0
var start_stock_units: int = 0
var colonize_cost_growth_pm: int = 0
var cohesion_per_neighbor_pm: int = 0
var max_growths: int = 0
var expansion_queue_size: int = 0
var match_ticks: int = 0

# --- Valeurs dérivées, calculées par prepare() ---
## Durée de pousse de chaque zone, en ticks (arrondie au plus proche, au moins 1).
var growth_ticks_by_zone: PackedInt32Array = PackedInt32Array()
## Puissances du facteur de coût de colonisation, en pour-mille.
var cost_pow_table: PackedInt64Array = PackedInt64Array()


## Définitions par défaut d'un mode, lues dans data/.
static func from_mode(mode: ModeDef) -> SimDefs:
	var zones: ZoneTable = load(ZONES_PATH)
	var tiers: TierTable = load(TIERS_PATH)
	var balance: BalanceDef = load(BALANCE_PATH)
	return from_resources(mode, zones, tiers, balance)


## Définitions construites à partir de ressources données.
static func from_resources(
	mode: ModeDef, zones: ZoneTable, tiers: TierTable, balance: BalanceDef
) -> SimDefs:
	var defs := SimDefs.new()
	defs.mode_id = mode.id
	defs.sectors = mode.colonies
	defs.rings_per_zone = mode.rings_per_zone
	for zone: ZoneDef in zones.zones:
		defs.zone_richness_pm.append(zone.richness_pm)
		defs.zone_cost_pm.append(zone.colonize_cost_pm)
		defs.zone_growth_pm.append(zone.growth_time_pm)
		defs.zone_capture_pm.append(zone.capture_time_pm)
	for tier: TierDef in tiers.tiers:
		defs.tier_cells.append(tier.cells)
		defs.tier_production_pm.append(tier.production_pm)
	defs.unit_cost = balance.unit_cost
	defs.cell_yield = balance.cell_yield
	defs.base_growth_ticks = balance.base_growth_ticks
	defs.start_stock_units = balance.start_stock_units
	defs.colonize_cost_growth_pm = balance.colonize_cost_growth_pm
	defs.cohesion_per_neighbor_pm = balance.cohesion_per_neighbor_pm
	defs.max_growths = balance.max_growths
	defs.expansion_queue_size = balance.expansion_queue_size
	defs.match_ticks = balance.match_ticks
	return defs


## Nombre de zones.
func zone_count() -> int:
	return zone_richness_pm.size()


## Rayon de la forêt (zones de même épaisseur, la dernière contient le centre).
func radius() -> int:
	return rings_per_zone * zone_count() - 1


## Stock de départ, en millièmes.
func start_stock() -> int:
	return start_stock_units * unit_cost


## Calcule les valeurs dérivées. À appeler après toute modification, avant la partie.
func prepare(max_cells: int) -> void:
	growth_ticks_by_zone = PackedInt32Array()
	for growth_pm: int in zone_growth_pm:
		var ticks: int = Fixed.div_round(base_growth_ticks * growth_pm, Fixed.ONE)
		growth_ticks_by_zone.append(maxi(1, ticks))
	cost_pow_table = Fixed.pow_table(colonize_cost_growth_pm, max_cells + 1)


## Liste des problèmes de cohérence (vide si tout va bien), pour refuser des réglages absurdes.
func validate() -> PackedStringArray:
	var problems := PackedStringArray()
	if not [2, 3, 6].has(sectors):
		problems.append("sectors")
	if rings_per_zone < 1:
		problems.append("rings_per_zone")
	var zones: int = zone_count()
	if zones < 1:
		problems.append("zones")
	for array: PackedInt32Array in [zone_cost_pm, zone_growth_pm, zone_capture_pm]:
		if array.size() != zones:
			problems.append("zones")
	if tier_production_pm.size() != tier_cells.size():
		problems.append("tiers")
	for i: int in range(1, tier_cells.size()):
		if tier_cells[i] <= tier_cells[i - 1]:
			problems.append("tier_cells")
	if unit_cost < 0 or cell_yield < 0 or start_stock_units < 0:
		problems.append("economy")
	if base_growth_ticks < 1:
		problems.append("base_growth_ticks")
	if colonize_cost_growth_pm < Fixed.ONE or colonize_cost_growth_pm > 5 * Fixed.ONE:
		problems.append("colonize_cost_growth_pm")
	if max_growths < 1 or expansion_queue_size < max_growths:
		problems.append("queue")
	if match_ticks < 1:
		problems.append("match_ticks")
	return problems


## Copie indépendante (les tableaux sont copiés).
func duplicate_defs() -> SimDefs:
	return SimDefs.from_dict(to_dict())


## Conversion en dictionnaire, pour les replays et le récapitulatif du Bac à sable.
func to_dict() -> Dictionary:
	return {
		"mode_id": String(mode_id),
		"sectors": sectors,
		"rings_per_zone": rings_per_zone,
		"zone_richness_pm": Array(zone_richness_pm),
		"zone_cost_pm": Array(zone_cost_pm),
		"zone_growth_pm": Array(zone_growth_pm),
		"zone_capture_pm": Array(zone_capture_pm),
		"tier_cells": Array(tier_cells),
		"tier_production_pm": Array(tier_production_pm),
		"unit_cost": unit_cost,
		"cell_yield": cell_yield,
		"base_growth_ticks": base_growth_ticks,
		"start_stock_units": start_stock_units,
		"colonize_cost_growth_pm": colonize_cost_growth_pm,
		"cohesion_per_neighbor_pm": cohesion_per_neighbor_pm,
		"max_growths": max_growths,
		"expansion_queue_size": expansion_queue_size,
		"match_ticks": match_ticks,
	}


## Reconstruit des définitions depuis to_dict() (les nombres peuvent arriver en flottants).
static func from_dict(data: Dictionary) -> SimDefs:
	var defs := SimDefs.new()
	defs.mode_id = StringName(str(data.get("mode_id", "")))
	defs.sectors = DictRead.get_int(data, "sectors")
	defs.rings_per_zone = DictRead.get_int(data, "rings_per_zone")
	defs.zone_richness_pm = DictRead.get_ints(data, "zone_richness_pm")
	defs.zone_cost_pm = DictRead.get_ints(data, "zone_cost_pm")
	defs.zone_growth_pm = DictRead.get_ints(data, "zone_growth_pm")
	defs.zone_capture_pm = DictRead.get_ints(data, "zone_capture_pm")
	defs.tier_cells = DictRead.get_ints(data, "tier_cells")
	defs.tier_production_pm = DictRead.get_ints(data, "tier_production_pm")
	defs.unit_cost = DictRead.get_int(data, "unit_cost")
	defs.cell_yield = DictRead.get_int(data, "cell_yield")
	defs.base_growth_ticks = DictRead.get_int(data, "base_growth_ticks")
	defs.start_stock_units = DictRead.get_int(data, "start_stock_units")
	defs.colonize_cost_growth_pm = DictRead.get_int(data, "colonize_cost_growth_pm")
	defs.cohesion_per_neighbor_pm = DictRead.get_int(data, "cohesion_per_neighbor_pm")
	defs.max_growths = DictRead.get_int(data, "max_growths")
	defs.expansion_queue_size = DictRead.get_int(data, "expansion_queue_size")
	defs.match_ticks = DictRead.get_int(data, "match_ticks")
	return defs
