class_name ColonyState
extends RefCounted
## État d'une colonie : ressources, Cœur, palier, pousses en cours et file d'expansion.
## Les quantités sont en millièmes de nutriment.

## Numéro de la colonie (son rang dans GameState.colonies).
var id: int = 0
## Secteur de la forêt où la colonie a démarré.
var sector: int = 0
## Vrai tant que la colonie n'est pas éliminée.
var alive: bool = true
## Case du Cœur.
var heart: int = -1
## Stock de nutriments.
var nutrients: int = 0
## Biomasse : total des nutriments produits depuis le début (GDD §5).
var biomass: int = 0
## Enzymes, en millièmes (sans plafond, GDD §5).
var enzymes: int = 0
## Plafond de stock de nutriments du dernier tick (GDD §5).
var stock_cap: int = 0
## Production d'Enzymes du dernier tick (millièmes par seconde).
var enzyme_production: int = 0
## Nombre de cases poussées, Cœur compris.
var cell_count: int = 0
## Palier de colonie atteint (0 = départ).
var tier: int = 0
## Production du dernier tick (nutriments par seconde).
var production: int = 0
## Plus forte production atteinte.
var peak_production: int = 0
## Tick où chaque palier a été atteint pour la première fois (index 0 = palier 1 ; −1 jamais).
var tier_ticks: PackedInt32Array = PackedInt32Array()
## Tick où une case de chaque zone a fini de pousser pour la première fois
## (index 0 = zone 1 ; −1 jamais ; 0 pour la zone de départ).
var zone_ticks: PackedInt32Array = PackedInt32Array()
## Cases en pousse, dans l'ordre de démarrage.
var growing: PackedInt32Array = PackedInt32Array()
## Cases en attente dans la file d'expansion, dans l'ordre d'ajout.
var queue: PackedInt32Array = PackedInt32Array()
## Cases dont le bâtiment attend dans la file de construction, dans l'ordre d'ajout.
var build_queue: PackedInt32Array = PackedInt32Array()
## Cases en chantier, dans l'ordre de démarrage.
var constructing: PackedInt32Array = PackedInt32Array()


## Nombre de places occupées dans la file d'expansion (pousses en cours comprises).
func queue_load() -> int:
	return growing.size() + queue.size()


## Nombre de places occupées dans la file de construction (chantiers compris).
func build_load() -> int:
	return constructing.size() + build_queue.size()


## Valeurs entières de la colonie, dans un ordre fixe, pour l'empreinte de la partie.
func hash_values() -> PackedInt64Array:
	var values := PackedInt64Array(
		[
			id,
			sector,
			1 if alive else 0,
			heart,
			nutrients,
			biomass,
			cell_count,
			tier,
			production,
			peak_production,
			growing.size(),
			queue.size(),
			enzymes,
			stock_cap,
			enzyme_production,
			build_queue.size(),
			constructing.size(),
		]
	)
	for cell: int in build_queue:
		values.append(cell)
	for cell: int in constructing:
		values.append(cell)
	for value: int in tier_ticks:
		values.append(value)
	for value: int in zone_ticks:
		values.append(value)
	for cell: int in growing:
		values.append(cell)
	for cell: int in queue:
		values.append(cell)
	return values
