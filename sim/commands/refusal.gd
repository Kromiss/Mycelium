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
	## La case n'est pas libre (poussée ou en pousse).
	CELL_TAKEN,
	## La case ne touche pas le réseau de la colonie (ni, pour la file, une case déjà en file).
	NOT_ADJACENT,
	## Pas assez de nutriments.
	NOT_ENOUGH_NUTRIENTS,
	## Toutes les pousses simultanées sont occupées.
	NO_GROWTH_SLOT,
	## La file d'expansion est pleine.
	QUEUE_FULL,
	## La case est déjà dans la file.
	ALREADY_QUEUED,
	## La case n'est pas dans la file.
	NOT_QUEUED,
	## La pousse de la case a déjà démarré : elle va à son terme.
	ALREADY_GROWING,
	## La partie est terminée.
	GAME_OVER,
}
