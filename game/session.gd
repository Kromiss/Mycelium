class_name Session
extends Node
## Une partie en cours (Architecture §8) : crée la simulation et son transport, cadence les
## ticks (1 par seconde de jeu) et prévient le reste du jeu par des signaux.
## Pause et vitesse (×1, ×2, ×4) ne sont permises qu'en Bac à sable (GDD §2.1 bis).

## Un tick vient d'être joué.
signal ticked(result: TickResult)
## La pause a été activée ou levée.
signal paused_changed(paused: bool)
## La vitesse a changé.
signal speed_changed(speed: int)

## Vitesses permises en Bac à sable, dans l'ordre du bouton.
const SPEEDS: Array[int] = [1, 2, 4]
## Nombre maximal de ticks joués en une image, pour ne pas figer le jeu après un ralentissement.
const MAX_TICKS_PER_FRAME: int = 8

var simulation: Simulation
var transport: Transport
## Enregistrement de la partie (commandes et empreintes), pour le rejeu.
var replay: Replay
## Colonie du joueur local.
var local_colony: int = 0
## Vitesse du temps (×1, ×2 ou ×4).
var speed: int = 1
## Vrai si le temps est arrêté.
var paused: bool = false

var _time_control: bool = false
var _accumulator: float = 0.0
var _running: bool = false


## Lance une partie locale. « time_control » permet la pause et la vitesse (Bac à sable).
func start_local(
	defs: SimDefs, game_seed: int, colony_count: int = -1, time_control: bool = false
) -> void:
	var count: int = defs.sectors if colony_count < 0 else colony_count
	replay = Replay.new(defs, game_seed, count)
	simulation = Simulation.new(defs, game_seed, count)
	transport = LocalTransport.new(simulation, replay)
	transport.tick_received.connect(_on_tick_received)
	_time_control = time_control
	_accumulator = 0.0
	speed = 1
	paused = false
	_running = true


## Vrai si la pause et la vitesse sont permises.
func has_time_control() -> bool:
	return _time_control


## Envoie une commande de la colonie locale, jouée au prochain tick.
func send_command(command: Command) -> void:
	command.colony_id = local_colony
	transport.send_command(command)


## Met en pause ou relance le temps (Bac à sable seulement).
func set_paused(value: bool) -> void:
	if not _time_control or value == paused:
		return
	paused = value
	paused_changed.emit(paused)


## Change la vitesse (Bac à sable seulement ; ×1, ×2 ou ×4).
func set_speed(value: int) -> void:
	if not _time_control or not SPEEDS.has(value) or value == speed:
		return
	speed = value
	speed_changed.emit(speed)


## Passe à la vitesse suivante (×1 → ×2 → ×4 → ×1).
func cycle_speed() -> void:
	set_speed(SPEEDS[(SPEEDS.find(speed) + 1) % SPEEDS.size()])


## Avancement vers le prochain tick (0 à 1), pour interpoler l'affichage.
func tick_fraction() -> float:
	return clampf(_accumulator, 0.0, 1.0)


## Fait avancer le temps réel de « seconds » secondes ; joue les ticks dus.
func advance_time(seconds: float) -> void:
	if not _running or paused:
		return
	_accumulator += seconds * speed
	var played: int = 0
	while _accumulator >= 1.0 and played < MAX_TICKS_PER_FRAME:
		_accumulator -= 1.0
		step()
		played += 1
	if played == MAX_TICKS_PER_FRAME:
		_accumulator = minf(_accumulator, 1.0)


## Joue un tick tout de suite.
func step() -> void:
	transport.advance()


func _process(delta: float) -> void:
	advance_time(delta)


func _on_tick_received(result: TickResult) -> void:
	ticked.emit(result)
