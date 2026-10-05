class_name Refusal
extends RefCounted
## Raisons pour lesquelles une commande est refusée (Architecture §4.3).
## L'interface les traduit en message pour le joueur.

enum Code {
	OK,
	## La colonie n'existe pas ou a été éliminée.
	UNKNOWN_COLONY,
	## Le type de commande est inconnu.
	UNKNOWN_COMMAND,
	## La case n'est pas dans la forêt.
	OUT_OF_MAP,
	## La partie est terminée.
	GAME_OVER,
	## La case n'est pas dans le cercle de portée de la Tourelle.
	OUT_OF_RANGE,
	## La case ne touche pas le territoire de la colonie.
	NOT_ADJACENT,
	## Case adverse ou capacité pendant la protection de départ.
	PROTECTED,
	## La case est à la colonie et à pleine vie : rien à soigner.
	NOT_WOUNDED,
	## La case est celle de la Tourelle.
	TURRET_CELL,
	## La case n'est pas à la colonie.
	NOT_OWNED,
	## Cette priorité de tir n'existe pas.
	UNKNOWN_PRIORITY,
	## Cette amélioration n'existe pas.
	UNKNOWN_UPGRADE,
	## Le palier de colonie qui la débloque n'est pas atteint.
	TIER_LOCKED,
	## Niveau maximal atteint.
	MAX_LEVEL,
	## Pas assez de nutriments.
	NOT_ENOUGH_NUTRIENTS,
	## Aucun choix de mutation en attente.
	NO_MUTATION_OFFER,
	## Ce choix de mutation n'existe pas.
	UNKNOWN_MUTATION,
	## Cette capacité n'existe pas.
	UNKNOWN_ABILITY,
	## La capacité se recharge.
	COOLDOWN,
	## Pas assez d'Enzymes.
	NOT_ENOUGH_ENZYMES,
	## Ce bâtiment n'existe pas.
	UNKNOWN_BUILDING,
	## Toutes les places de bâtiment sont prises.
	NO_BUILDING_SLOT,
	## La case a déjà un bâtiment.
	CELL_OCCUPIED,
	## Aucun de mes bâtiments sur cette case.
	NO_BUILDING,
	## Un bâtiment ne peut pas être soigné par le Sporophore.
	BUILDING_CELL,
}
