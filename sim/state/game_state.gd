class_name GameState
extends RefCounted
## État complet d'une partie à un instant donné (Architecture §4.1).
## Uniquement des entiers, rangés dans des tableaux compacts indexés par numéro de case.

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
## Colonie propriétaire de chaque case (−1 = libre).
var owner: PackedInt32Array = PackedInt32Array()
## PV de chaque case, en millièmes (pour la case d'une Tourelle, voir ColonyState.turret_hp).
var hp: PackedInt64Array = PackedInt64Array()
## Dernière colonie qui a entamé la case, tant qu'elle n'est pas revenue à pleine vie (−1 : aucune).
var last_hitter: PackedInt32Array = PackedInt32Array()
## Tick jusqu'auquel (exclu) la case ne se régénère pas (Toxique, Nuage toxique).
var no_regen_until: PackedInt32Array = PackedInt32Array()
## Rang de chaque case dans un ordre tiré de la graine, pour départager les cases à égalité.
var cell_rank: PackedInt32Array = PackedInt32Array()
## Nombre de colonies au départ.
var start_colonies: int = 0
## Classement final (numéros de colonie, la meilleure en premier), rempli à la fin de la partie.
var ranking: PackedInt32Array = PackedInt32Array()
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


## Colonie propriétaire d'une case, ou null si la case est libre.
func owner_of(cell: int) -> ColonyState:
	return colony(owner[cell])


## Vrai si la case appartient à la colonie.
func is_owned_by(cell: int, colony_id: int) -> bool:
	return owner[cell] == colony_id


## Vrai si une Tourelle (vivante) occupe la case.
func is_turret_cell(cell: int) -> bool:
	var holder: ColonyState = owner_of(cell)
	return holder != null and holder.turret == cell


## Nombre de voisines de la case qui appartiennent à la colonie (0 à 6).
func owned_neighbors(cell: int, colony_id: int) -> int:
	# Lecture directe de la table des voisines : appelée très souvent (tirs, PV, production).
	var table: PackedInt32Array = map.neighbor_table
	var total: int = 0
	for slot: int in range(cell * 6, cell * 6 + 6):
		var other: int = table[slot]
		if other >= 0 and owner[other] == colony_id:
			total += 1
	return total


## Vrai si une voisine de la case appartient à la colonie.
func touches_colony(cell: int, colony_id: int) -> bool:
	var table: PackedInt32Array = map.neighbor_table
	for slot: int in range(cell * 6, cell * 6 + 6):
		var other: int = table[slot]
		if other >= 0 and owner[other] == colony_id:
			return true
	return false


## Distance (en cases) entre deux cases.
func distance(a: int, b: int) -> int:
	return Hex.distance(map.cells[a], map.cells[b])


## Vrai si la protection de départ est terminée (cases adverses et capacités permises).
func protection_over() -> bool:
	return tick >= defs.protection_ticks


## Nombre de colonies encore en vie.
func alive_count() -> int:
	var total: int = 0
	for colony_state: ColonyState in colonies:
		if colony_state.alive:
			total += 1
	return total
