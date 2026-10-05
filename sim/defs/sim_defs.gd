class_name SimDefs
extends RefCounted
## Tous les chiffres dont une partie a besoin, copiés depuis les ressources de data/ au
## lancement (Architecture §5). Le Bac à sable et la partie personnalisée modifient ces
## copies, jamais les fichiers. La simulation ne lit rien d'autre pendant les ticks.
## Les quantités sont en millièmes, les multiplicateurs en pour-mille.

const ZONES_PATH: String = "res://data/zones.tres"
const TIERS_PATH: String = "res://data/tiers.tres"
const BALANCE_PATH: String = "res://data/balance.tres"
const UPGRADES_PATH: String = "res://data/upgrades.tres"
const MUTATIONS_PATH: String = "res://data/mutations.tres"
const ABILITIES_PATH: String = "res://data/abilities.tres"
## Champs copiés tels quels depuis BalanceDef (mêmes noms des deux côtés).
const BALANCE_FIELDS: PackedStringArray = [
	"unit_cost",
	"cell_yield",
	"start_stock_units",
	"cohesion_production_pm",
	"cohesion_production_cap_pm",
	"strain_bonus_pm",
	"upgrade_cost_growth_pm",
	"deep_zone",
	"cell_hp",
	"cohesion_hp_pm",
	"regen_pm",
	"captured_hp_pm",
	"turret_damage",
	"turret_rate_pm",
	"turret_range",
	"turret_spores",
	"turret_hp_cells",
	"heal_pm",
	"crit_damage_pm",
	"match_ticks",
	"protection_ticks",
	"trophy_production_pm",
	"trophy_enzymes",
	"mutation_choices",
]
## Champs des zones et des paliers (tableaux, index 0 = zone 1 ou palier 1).
const ZONE_FIELDS: PackedStringArray = ["zone_richness_pm", "zone_free_hp_pm", "zone_defense_pm"]
const TIER_FIELDS: PackedStringArray = ["tier_cells", "tier_production_pm", "tier_enzymes"]
## Taille des tables de coût d'une amélioration sans niveau maximal.
const UNCAPPED_LEVELS: int = 400

# --- Forêt (mode) ---
## Identifiant du mode dont la forêt est tirée (« duel », « ffa »).
var mode_id: StringName = &""
## Nombre de secteurs de la forêt (2, 3 ou 6).
var sectors: int = 2
## Épaisseur de chaque zone, en anneaux.
var rings_per_zone: int = 2

# --- Zones (index 0 = zone 1, au bord) ---
var zone_richness_pm: PackedInt32Array = PackedInt32Array()
var zone_free_hp_pm: PackedInt32Array = PackedInt32Array()
var zone_defense_pm: PackedInt32Array = PackedInt32Array()

# --- Paliers (index 0 = palier 1) ---
var tier_cells: PackedInt32Array = PackedInt32Array()
var tier_production_pm: PackedInt32Array = PackedInt32Array()
var tier_enzymes: PackedInt32Array = PackedInt32Array()

# --- Constantes (voir BalanceDef pour le sens de chacune) ---
var unit_cost: int = 0
var cell_yield: int = 0
var start_stock_units: int = 0
var cohesion_production_pm: int = 0
var cohesion_production_cap_pm: int = 0
var strain_bonus_pm: int = 0
var upgrade_cost_growth_pm: int = 0
var deep_zone: int = 0
var cell_hp: int = 0
var cohesion_hp_pm: int = 0
var regen_pm: int = 0
var captured_hp_pm: int = 0
var turret_damage: int = 0
var turret_rate_pm: int = 0
var turret_range: int = 0
var turret_spores: int = 0
var turret_hp_cells: int = 0
var heal_pm: int = 0
var crit_damage_pm: int = 0
var match_ticks: int = 0
var protection_ticks: int = 0
var trophy_production_pm: int = 0
var trophy_enzymes: int = 0
var mutation_choices: int = 0

# --- Contenu ---
## Améliorations, dans l'ordre du panneau ; une amélioration est désignée par son rang ici.
var upgrades: Array[SimUpgrade] = []
## Mutations, désignées par leur rang ici.
var mutations: Array[SimMutation] = []
## Capacités, dans l'ordre des boutons.
var abilities: Array[SimAbility] = []

# --- Valeurs dérivées, calculées par prepare() ---
## Pour chaque amélioration : facteur de coût ^ niveau, en pour-mille.
var upgrade_cost_tables: Array[PackedInt64Array] = []


## Définitions par défaut d'un mode, lues dans data/.
static func from_mode(mode: ModeDef) -> SimDefs:
	var zones: ZoneTable = load(ZONES_PATH)
	var tiers: TierTable = load(TIERS_PATH)
	var balance: BalanceDef = load(BALANCE_PATH)
	var defs: SimDefs = from_resources(mode, zones, tiers, balance)
	var upgrade_table: UpgradeTable = load(UPGRADES_PATH)
	for def: UpgradeDef in upgrade_table.upgrades:
		defs.upgrades.append(SimUpgrade.from_def(def))
	var mutation_table: MutationTable = load(MUTATIONS_PATH)
	for def: MutationDef in mutation_table.mutations:
		defs.mutations.append(SimMutation.from_def(def))
	var ability_table: AbilityTable = load(ABILITIES_PATH)
	for def: AbilityDef in ability_table.abilities:
		defs.abilities.append(SimAbility.from_def(def))
	return defs


## Définitions construites à partir des ressources de la forêt (sans contenu).
static func from_resources(
	mode: ModeDef, zones: ZoneTable, tiers: TierTable, balance: BalanceDef
) -> SimDefs:
	var defs := SimDefs.new()
	defs.mode_id = mode.id
	defs.sectors = mode.colonies
	defs.rings_per_zone = mode.rings_per_zone
	for zone: ZoneDef in zones.zones:
		defs.zone_richness_pm.append(zone.richness_pm)
		defs.zone_free_hp_pm.append(zone.free_hp_pm)
		defs.zone_defense_pm.append(zone.defense_pm)
	for tier: TierDef in tiers.tiers:
		defs.tier_cells.append(tier.cells)
		defs.tier_production_pm.append(tier.production_pm)
		defs.tier_enzymes.append(tier.enzymes)
	for field: String in BALANCE_FIELDS:
		defs.set(field, balance.get(field))
	return defs


## Nombre de zones.
func zone_count() -> int:
	return zone_richness_pm.size()


## Nombre de paliers (le départ n'en est pas un).
func tier_count() -> int:
	return tier_cells.size()


## Rayon de la forêt (zones de même épaisseur, la dernière contient le centre).
func radius() -> int:
	return rings_per_zone * zone_count() - 1


## Stock de départ, en millièmes.
func start_stock() -> int:
	return start_stock_units * unit_cost


## Rang d'une amélioration d'après son identifiant (−1 si elle n'existe pas).
func upgrade_index(id: StringName) -> int:
	for index: int in range(upgrades.size()):
		if upgrades[index].id == id:
			return index
	return -1


## Rang d'une capacité d'après son identifiant (−1 si elle n'existe pas).
func ability_index(id: StringName) -> int:
	for index: int in range(abilities.size()):
		if abilities[index].id == id:
			return index
	return -1


## Rang d'une mutation d'après son identifiant (−1 si elle n'existe pas).
func mutation_index(id: StringName) -> int:
	for index: int in range(mutations.size()):
		if mutations[index].id == id:
			return index
	return -1


## Calcule les valeurs dérivées. À appeler après toute modification, avant la partie.
func prepare() -> void:
	upgrade_cost_tables = []
	for upgrade: SimUpgrade in upgrades:
		var growth: int = (
			upgrade.cost_growth_pm if upgrade.cost_growth_pm > 0 else upgrade_cost_growth_pm
		)
		var size: int = upgrade.max_level if upgrade.max_level > 0 else UNCAPPED_LEVELS
		upgrade_cost_tables.append(Fixed.pow_table(growth, size + 1))


## Liste des problèmes de cohérence (vide si tout va bien), pour refuser des réglages absurdes.
func validate() -> PackedStringArray:
	var problems := PackedStringArray()
	if not [2, 3, 6].has(sectors):
		problems.append("sectors")
	if rings_per_zone < 1:
		problems.append("rings_per_zone")
	var zones: int = zone_count()
	if zones < 1 or zone_free_hp_pm.size() != zones or zone_defense_pm.size() != zones:
		problems.append("zones")
	for array: PackedInt32Array in [zone_free_hp_pm, zone_defense_pm]:
		for value: int in array:
			if value < 1:
				problems.append("zone_hp")
	if tier_production_pm.size() != tier_count() or tier_enzymes.size() != tier_count():
		problems.append("tiers")
	for i: int in range(1, tier_count()):
		if tier_cells[i] <= tier_cells[i - 1]:
			problems.append("tier_cells")
	if unit_cost < 0 or cell_yield < 0 or start_stock_units < 0:
		problems.append("economy")
	if cell_hp < 1 or turret_hp_cells < 1:
		problems.append("hp")
	if turret_damage < 0 or turret_rate_pm < 0 or turret_range < 1 or turret_spores < 1:
		problems.append("turret")
	if upgrade_cost_growth_pm < Fixed.ONE:
		problems.append("upgrade_cost_growth_pm")
	if match_ticks < 1 or protection_ticks < 0:
		problems.append("match_ticks")
	if mutation_choices < 1:
		problems.append("mutation_choices")
	for upgrade: SimUpgrade in upgrades:
		if upgrade.unlock_tier < 0 or upgrade.unlock_tier > tier_count():
			problems.append("upgrades")
		elif upgrade.base_cost_units < 0 or upgrade.max_level < 0:
			problems.append("upgrades")
		elif upgrade.cost_growth_pm != 0 and upgrade.cost_growth_pm < Fixed.ONE:
			problems.append("upgrades")
	for ability: SimAbility in abilities:
		if ability.unlock_tier < 0 or ability.unlock_tier > tier_count():
			problems.append("abilities")
		elif ability.cost_enzymes < 0 or ability.cooldown_ticks < 0 or ability.radius < 0:
			problems.append("abilities")
	return problems


## Copie indépendante (les tableaux sont copiés).
func duplicate_defs() -> SimDefs:
	return SimDefs.from_dict(to_dict())


## Conversion en dictionnaire, pour les replays et le récapitulatif du Bac à sable.
func to_dict() -> Dictionary:
	var data: Dictionary = {
		"mode_id": String(mode_id),
		"sectors": sectors,
		"rings_per_zone": rings_per_zone,
	}
	for field: String in ZONE_FIELDS + TIER_FIELDS:
		var values: PackedInt32Array = get(field)
		data[field] = Array(values)
	for field: String in BALANCE_FIELDS:
		data[field] = get(field)
	data["upgrades"] = upgrades.map(func(item: SimUpgrade) -> Dictionary: return item.to_dict())
	data["mutations"] = mutations.map(func(item: SimMutation) -> Dictionary: return item.to_dict())
	data["abilities"] = abilities.map(func(item: SimAbility) -> Dictionary: return item.to_dict())
	return data


## Reconstruit des définitions depuis to_dict() (les nombres peuvent arriver en flottants).
static func from_dict(data: Dictionary) -> SimDefs:
	var defs := SimDefs.new()
	defs.mode_id = StringName(str(data.get("mode_id", "")))
	defs.sectors = DictRead.get_int(data, "sectors")
	defs.rings_per_zone = DictRead.get_int(data, "rings_per_zone")
	for field: String in ZONE_FIELDS + TIER_FIELDS:
		defs.set(field, DictRead.get_ints(data, field))
	for field: String in BALANCE_FIELDS:
		defs.set(field, DictRead.get_int(data, field))
	for item: Dictionary in _dicts(data, "upgrades"):
		defs.upgrades.append(SimUpgrade.from_dict(item))
	for item: Dictionary in _dicts(data, "mutations"):
		defs.mutations.append(SimMutation.from_dict(item))
	for item: Dictionary in _dicts(data, "abilities"):
		defs.abilities.append(SimAbility.from_dict(item))
	return defs


## Dictionnaires rangés dans une liste sous « key » (les autres valeurs sont ignorées).
static func _dicts(data: Dictionary, key: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var raw: Variant = data.get(key, [])
	if raw is Array:
		var items: Array = raw
		for item: Variant in items:
			if item is Dictionary:
				var entry: Dictionary = item
				result.append(entry)
	return result
