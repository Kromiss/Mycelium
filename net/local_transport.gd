class_name LocalTransport
extends Transport
## Transport local : la simulation tourne dans le jeu, les commandes lui sont remises
## directement. Utilisé en solo, dans le Bac à sable, le tutoriel et les tests.
## Les ordres du joueur local sont joués tout de suite, entre deux ticks (apply_now()), ceux des
## robots au tick suivant. Toutes les commandes et les empreintes sont enregistrées pour le
## rejeu.

var simulation: Simulation
var replay: Replay

var _pending: Array[Command] = []


func _init(game_simulation: Simulation, recording: Replay = null) -> void:
	simulation = game_simulation
	replay = recording


func send_command(command: Command) -> void:
	_pending.append(command)


func apply_now(command: Command) -> void:
	var batch: Array[Command] = [command]
	var result: TickResult = simulation.apply_now(batch)
	if replay != null:
		replay.record_early(batch)
	commands_applied.emit(result)


func advance() -> void:
	var batch: Array[Command] = _pending
	_pending = []
	var result: TickResult = simulation.tick(batch)
	if replay != null:
		replay.record_tick(batch, result)
	tick_received.emit(result)
