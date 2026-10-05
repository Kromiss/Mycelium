class_name ReplayTransport
extends Transport
## Transport de rejeu : il recrée la partie enregistrée et lui remet, à chaque tick, les
## commandes enregistrées pour ce tick (celles jouées au clic juste avant). Les commandes
## envoyées par le jeu sont ignorées.

var simulation: Simulation

var _replay: Replay
var _next: int = 0


func _init(recording: Replay) -> void:
	_replay = recording
	simulation = recording.create_simulation()


func send_command(_command: Command) -> void:
	pass


func advance() -> void:
	var batch: Replay.Batch = _replay.batch_at(simulation.state.tick, _next)
	_next = batch.next
	if not batch.early.is_empty():
		simulation.apply_now(batch.early)
	tick_received.emit(simulation.tick(batch.normal))
