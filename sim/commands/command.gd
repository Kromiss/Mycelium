class_name Command
extends RefCounted
## Commande envoyée à la simulation par un joueur, un robot ou un script (Architecture §4.3).
## Seule la simulation modifie l'état ; une commande n'est qu'une demande, qu'elle valide.

enum Type { COLONIZE, ENQUEUE, DEQUEUE, BUILD, DEMOLISH }

## Tick auquel la commande a été appliquée (renseigné par la simulation).
var tick: int = -1
## Colonie qui envoie la commande.
var colony_id: int = 0
## Type de commande.
var type: Type = Type.COLONIZE


## Conversion en dictionnaire, pour le réseau et les replays.
func to_dict() -> Dictionary:
	return {"type": int(type), "tick": tick, "colony": colony_id}


## Reconstruit une commande à partir de to_dict(), ou null si le dictionnaire est invalide.
static func from_dict(data: Dictionary) -> Command:
	var command: Command = null
	match DictRead.get_int(data, "type", -1):
		Type.COLONIZE:
			command = ColonizeCommand.new(Vector2i.ZERO)
		Type.ENQUEUE:
			command = EnqueueCommand.new(Vector2i.ZERO)
		Type.DEQUEUE:
			command = DequeueCommand.new(Vector2i.ZERO)
		Type.BUILD:
			command = BuildCommand.new(Vector2i.ZERO, &"")
		Type.DEMOLISH:
			command = DemolishCommand.new(Vector2i.ZERO)
		_:
			return null
	command.tick = DictRead.get_int(data, "tick", -1)
	command.colony_id = DictRead.get_int(data, "colony", 0)
	command._read_fields(data)
	return command


## Lit les champs propres à une sous-classe.
func _read_fields(_data: Dictionary) -> void:
	pass
