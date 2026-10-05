class_name ReplayTransport
extends Transport
## Transport de rejeu : il recrée la partie enregistrée et lui remet, à chaque tick, les
## commandes enregistrées pour ce tick. Les commandes envoyées par le jeu sont ignorées.

var simulation: Simulation

var _replay: Replay
var _next: int = 0


func _init(recording: Replay) -> void:
	_replay = recording
	simulation = recording.create_simulation()


func send_command(_command: Command) -> void:
	pass


func advance() -> void:
	var tick: int = simulation.state.tick
	var batch: Array[Command] = []
	var commands: Array[Dictionary] = _replay.commands
	while _next < commands.size() and DictRead.get_int(commands[_next], "tick", -1) <= tick:
		if DictRead.get_int(commands[_next], "tick", -1) == tick:
			var command: Command = Command.from_dict(commands[_next])
			if command != null:
				batch.append(command)
		_next += 1
	tick_received.emit(simulation.tick(batch))
