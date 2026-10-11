class_name ColonyState
extends RefCounted
## État d'une colonie : ressources, Sporophore, propagation, palier, améliorations, mutations et
## statistiques. Les quantités sont en millièmes.

## Numéro de la colonie (son rang dans GameState.colonies).
var id: int = 0
## Secteur de la forêt où la colonie a démarré.
var sector: int = 0
## Vrai tant que la colonie n'est pas éliminée.
var alive: bool = true

# --- Ressources ---
## Stock de nutriments (sans plafond).
var nutrients: int = 0
## Biomasse : total des nutriments produits depuis le début (GDD §8.1).
var biomass: int = 0
## Enzymes, en millièmes.
var enzymes: int = 0
## Production du dernier tick (nutriments par seconde).
var production: int = 0
## Plus forte production atteinte.
var peak_production: int = 0
## Nombre de cases, Tourelle comprise.
var cell_count: int = 0
## Palier de colonie atteint (0 = départ).
var tier: int = 0
## Tick où chaque palier a été atteint pour la première fois (index 0 = palier 1 ; −1 jamais).
var tier_ticks: PackedInt32Array = PackedInt32Array()
## Tick où une case de chaque zone a été prise pour la première fois
## (index 0 = zone 1 ; −1 jamais ; 0 pour la zone de départ).
var zone_ticks: PackedInt32Array = PackedInt32Array()

# --- Sporophore (GDD §5) ---
## Case du Sporophore (−1 une fois la colonie éliminée).
var turret: int = -1
## PV du Sporophore, en millièmes.
var turret_hp: int = 0

# --- Propagation (GDD §5 bis) ---
## Points chauds, du plus ancien au plus récent (numéros de case).
var hotspots: PackedInt32Array = PackedInt32Array()
## Cases de bordure au dernier tick.
var border_cells: int = 0
## Force de propagation utilisée au dernier tick, en millièmes de PV par seconde.
var push_force: int = 0

# --- Améliorations, mutations ---
## Niveau de chaque amélioration (rang dans SimDefs.upgrades).
var upgrade_levels: PackedInt32Array = PackedInt32Array()
## Mutations prises, dans l'ordre (rangs dans SimDefs.mutations), et palier de chacune.
var mutations: PackedInt32Array = PackedInt32Array()
var mutation_tiers: PackedInt32Array = PackedInt32Array()
## Choix de mutations en attente, à la suite (blocs de SimDefs.mutation_choices rangs,
## complétés par −1 s'il reste moins de mutations que de choix). Le premier bloc est affiché.
var pending_offers: PackedInt32Array = PackedInt32Array()
## Palier qui a donné chaque choix en attente (un par bloc).
var pending_tiers: PackedInt32Array = PackedInt32Array()

# --- Conflit et statistiques ---
## Trophées gagnés (Sporophores abattus, GDD §12).
var trophies: int = 0
## Tick de l'élimination (−1 : en vie) et colonie qui a abattu la Tourelle (−1 : aucune).
var eliminated_tick: int = -1
var killer: int = -1
## Cases prises (libres et adverses) depuis le début.
var cells_captured: int = 0


## Rang de chaque mutation prise, pour savoir si une mutation l'est déjà.
func has_mutation(index: int) -> bool:
	return mutations.has(index)


## Nombre de choix de mutations en attente.
func pending_choice_count(choices: int) -> int:
	@warning_ignore("integer_division")
	return pending_offers.size() / maxi(1, choices)


## Copie de ce dont dépendent les chiffres de la colonie (ColonyStats) : améliorations,
## mutations, palier, Trophées. Sert à prévoir l'effet d'un achat sans toucher à l'état.
func stats_copy() -> ColonyState:
	var copy := ColonyState.new()
	copy.id = id
	copy.alive = alive
	copy.tier = tier
	copy.trophies = trophies
	copy.turret = turret
	copy.upgrade_levels = upgrade_levels.duplicate()
	copy.mutations = mutations.duplicate()
	return copy


## Valeurs entières de la colonie, dans un ordre fixe, pour l'empreinte de la partie.
func hash_values() -> PackedInt64Array:
	var values := PackedInt64Array(
		[
			id,
			sector,
			1 if alive else 0,
			nutrients,
			biomass,
			enzymes,
			production,
			peak_production,
			cell_count,
			tier,
			turret,
			turret_hp,
			border_cells,
			push_force,
			trophies,
			eliminated_tick,
			killer,
			cells_captured,
		]
	)
	for array: PackedInt32Array in [
		tier_ticks,
		zone_ticks,
		hotspots,
		upgrade_levels,
		mutations,
		mutation_tiers,
		pending_offers,
		pending_tiers,
	]:
		values.append(array.size())
		for value: int in array:
			values.append(value)
	return values
