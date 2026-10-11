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
	## La case est déjà à la colonie (point chaud refusé, décidé le 11 octobre 2026).
	OWN_CELL,
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
}
