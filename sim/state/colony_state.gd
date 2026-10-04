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
## Nombre de cases poussées, Cœur compris.
var cell_count: int = 0
## Palier de colonie atteint (0 = départ).
var tier: int = 0
## Production du dernier tick (nutriments par seconde).
var production: int = 0
## Plus forte production atteinte.
var peak_production: int = 0
## Cases en pousse, dans l'ordre de démarrage.
var growing: PackedInt32Array = PackedInt32Array()
## Cases en attente dans la file d'expansion, dans l'ordre d'ajout.
var queue: PackedInt32Array = PackedInt32Array()


## Nombre de places occupées dans la file d'expansion (pousses en cours comprises).
func queue_load() -> int:
	return growing.size() + queue.size()


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
		]
	)
	for cell: int in growing:
		values.append(cell)
	for cell: int in queue:
		values.append(cell)
	return values
