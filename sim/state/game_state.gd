class_name GameState
extends RefCounted
## État complet d'une partie à un instant donné (Architecture §4.1).
## Uniquement des entiers, rangés dans des tableaux compacts indexés par numéro de case.

## État d'une case (GDD §4.2). Les états de construction et de prise arrivent avec G2 et G3.
enum CellState { FREE, GROWING, OWNED }
## État du bâtiment d'une case (GDD §7.1) : aucun, en file de construction, en chantier, construit.
enum BuildState { NONE, QUEUED, CONSTRUCTING, BUILT }

## Numéro du prochain tick à jouer (= secondes de jeu écoulées).
var tick: int = 0
## Vrai quand la partie est terminée : plus aucun tick ne change l'état.
var finished: bool = false
## Graine de la partie.
var game_seed: int = 0
## Chiffres de la partie.
var defs: SimDefs
## Forêt.
var map: ForestMap
## Colonie propriétaire de chaque case (−1 = libre). Une case en pousse appartient déjà
## à la colonie qui la fait pousser.
var owner: PackedInt32Array = PackedInt32Array()
## État de chaque case (CellState).
var cell_state: PackedInt32Array = PackedInt32Array()
## Pousse restante, en millièmes de seconde (0 si la case ne pousse pas). Une Pépinière
## proche fait avancer la pousse plus vite (GDD §7.2).
var growth_left: PackedInt32Array = PackedInt32Array()
## Bâtiment de chaque case : rang dans SimDefs.buildings, −1 sans bâtiment.
var building: PackedInt32Array = PackedInt32Array()
## État du bâtiment de chaque case (BuildState).
var building_state: PackedInt32Array = PackedInt32Array()
## Secondes de chantier restantes.
var build_left: PackedInt32Array = PackedInt32Array()
## Prix payé pour le bâtiment (millièmes de nutriment, et d'Enzymes), pour les remboursements.
var building_paid: PackedInt64Array = PackedInt64Array()
var building_paid_enzymes: PackedInt64Array = PackedInt64Array()
## 1 si le bâtiment est construit et actif (palier atteint, GDD §7.6).
var building_active: PackedByteArray = PackedByteArray()
## 1 si la case est poussée et reliée au Cœur de sa colonie par ses cases poussées.
var connected: PackedByteArray = PackedByteArray()
## Colonies, par numéro.
var colonies: Array[ColonyState] = []
## Aléatoire de la partie.
var rng: SimRng


## Nombre de cases de la forêt.
func cell_count() -> int:
	return map.size()


## Colonie de numéro donné, ou null si elle n'existe pas.
func colony(colony_id: int) -> ColonyState:
	if colony_id < 0 or colony_id >= colonies.size():
		return null
	return colonies[colony_id]


## Vrai si la case est poussée et appartient à la colonie.
func is_owned_by(cell: int, colony_id: int) -> bool:
	return owner[cell] == colony_id and cell_state[cell] == CellState.OWNED


## Nombre de voisines poussées de la case qui appartiennent à la colonie (0 à 6).
func owned_neighbors(cell: int, colony_id: int) -> int:
	var total: int = 0
	for direction: int in range(6):
		var other: int = map.neighbor_index(cell, direction)
		if other >= 0 and is_owned_by(other, colony_id):
			total += 1
	return total


## Vrai si une voisine de la case fait partie du réseau de la colonie (poussée et reliée).
func touches_network(cell: int, colony_id: int) -> bool:
	for direction: int in range(6):
		var other: int = map.neighbor_index(cell, direction)
		if other >= 0 and connected[other] == 1 and owner[other] == colony_id:
			return true
	return false


## Vrai si une voisine de la case figure dans la liste donnée.
func touches_any(cell: int, cells: PackedInt32Array) -> bool:
	for direction: int in range(6):
		var other: int = map.neighbor_index(cell, direction)
		if other >= 0 and cells.has(other):
			return true
	return false


## Vrai si la case touche au moins une case non possédée par la colonie (case frontière, §7.4).
func is_frontier(cell: int, colony_id: int) -> bool:
	for direction: int in range(6):
		var other: int = map.neighbor_index(cell, direction)
		if other >= 0 and not is_owned_by(other, colony_id):
			return true
	return false


## Bâtiment actif d'un type donné sur la case (−1 : pas de bâtiment actif).
func active_building(cell: int) -> int:
	return building[cell] if building_active[cell] == 1 else -1


## Recalcule les cases reliées au Cœur de chaque colonie (parcours en largeur).
func recompute_network() -> void:
	connected.fill(0)
	for colony_state: ColonyState in colonies:
		if not colony_state.alive or colony_state.heart < 0:
			continue
		if not is_owned_by(colony_state.heart, colony_state.id):
			continue
		var frontier := PackedInt32Array([colony_state.heart])
		connected[colony_state.heart] = 1
		var next: int = 0
		while next < frontier.size():
			var cell: int = frontier[next]
			next += 1
			for direction: int in range(6):
				var other: int = map.neighbor_index(cell, direction)
				if other >= 0 and connected[other] == 0 and is_owned_by(other, colony_state.id):
					connected[other] = 1
					frontier.append(other)
