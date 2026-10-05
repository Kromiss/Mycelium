class_name Transport
extends RefCounted
## Transport des commandes vers la simulation et des résultats de tick vers la partie
## (Architecture §7). Le reste du jeu ne sait pas quel transport est utilisé.

## Un tick vient d'être joué.
@warning_ignore("unused_signal")
signal tick_received(result: TickResult)
## Des commandes du joueur local viennent d'être jouées tout de suite, entre deux ticks.
@warning_ignore("unused_signal")
signal commands_applied(result: TickResult)


## Transmet une commande, jouée au prochain tick.
func send_command(_command: Command) -> void:
	assert(false, "À implémenter par le transport.")


## Transmet une commande du joueur local, jouée tout de suite si le transport le permet (en
## local), sinon au prochain tick. Par défaut : au prochain tick.
func apply_now(command: Command) -> void:
	send_command(command)


## Fait jouer le prochain tick (côté hôte ou en local).
func advance() -> void:
	assert(false, "À implémenter par le transport.")
