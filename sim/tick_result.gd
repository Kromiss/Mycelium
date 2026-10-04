class_name TickResult
extends RefCounted
## Ce qui a changé pendant un tick (Architecture §4.2), pour l'affichage, le réseau et les tests.

## Numéro du tick joué.
var tick: int = 0
## Cases dont le propriétaire ou les PV ont changé (sans doublon, ordre croissant).
var changed_cells: PackedInt32Array = PackedInt32Array()
## Colonies dont les ressources ou l'état ont changé (sans doublon, ordre croissant).
var changed_colonies: PackedInt32Array = PackedInt32Array()
## Commandes refusées et leur raison (Refusal.Code).
var refused: Array[Command] = []
var refused_codes: PackedInt32Array = PackedInt32Array()
## Spores tirées : paires (colonie, case touchée), dans l'ordre des tirs.
var shots: PackedInt32Array = PackedInt32Array()
## Cases prises : triplets (colonie, case, ancien propriétaire ou −1).
var captures: PackedInt32Array = PackedInt32Array()
## Cases perdues parce qu'elles n'étaient plus reliées à la Tourelle : paires (colonie, case).
var cells_lost: PackedInt32Array = PackedInt32Array()
## Tourelles abattues : paires (colonie éliminée, colonie qui l'a abattue).
var eliminations: PackedInt32Array = PackedInt32Array()
## Pas terminés : triplets (colonie, case de départ, case d'arrivée).
var moves: PackedInt32Array = PackedInt32Array()
## Capacités lancées : triplets (colonie, rang de la capacité, case choisie ou −1).
var abilities: PackedInt32Array = PackedInt32Array()
## Changements de palier : triplets (colonie, ancien palier, nouveau palier).
var tier_changes: PackedInt32Array = PackedInt32Array()
## Colonies qui ont reçu un nouveau choix de mutations.
var mutation_offers: PackedInt32Array = PackedInt32Array()
## Vrai si la partie s'est terminée à ce tick (ou l'était déjà).
var finished: bool = false
## Empreinte de l'état à la fin du tick.
var state_hash: int = 0


## Note qu'une case a changé.
func cell_changed(cell: int) -> void:
	_insert_sorted(changed_cells, cell)


## Note qu'une colonie a changé.
func colony_changed(colony_id: int) -> void:
	_insert_sorted(changed_colonies, colony_id)


## Note une commande refusée.
func refuse(command: Command, code: int) -> void:
	refused.append(command)
	refused_codes.append(code)


static func _insert_sorted(values: PackedInt32Array, value: int) -> void:
	var position: int = values.bsearch(value)
	if position < values.size() and values[position] == value:
		return
	values.insert(position, value)
