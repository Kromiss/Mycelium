class_name Session
extends Node
## Une partie en cours (Architecture §8) : crée la simulation et son transport, cadence les
## ticks (1 par seconde de jeu), fait jouer les robots et prévient le reste du jeu par des
## signaux. Pause et vitesse (×1, ×2, ×4) ne sont permises qu'en Bac à sable (GDD §2.1 bis).
## En spectateur (partie de robots du panneau de simulations, ou rejeu d'un enregistrement),
## aucun ordre n'est accepté et la vitesse va de ×1 à ×64 (GDD §18.5).

## Un tick vient d'être joué.
signal ticked(result: TickResult)
## La pause a été activée ou levée.
signal paused_changed(paused: bool)
## La vitesse a changé.
signal speed_changed(speed: int)
## La partie est terminée (dernière colonie en vie ou durée maximale) : plus aucun tick.
signal game_finished

## Vitesses permises en Bac à sable, dans l'ordre du bouton.
const SPEEDS: Array[int] = [1, 2, 4]
## Vitesses du spectateur (GDD §18.5).
const SPECTATOR_SPEEDS: Array[int] = [1, 4, 16, 64]
## Nombre maximal de ticks joués en une image, pour ne pas figer le jeu après un ralentissement.
const MAX_TICKS_PER_FRAME: int = 8
## En spectateur, assez pour suivre ×64 même à 30 images par seconde.
const MAX_SPECTATOR_TICKS_PER_FRAME: int = 64

var simulation: Simulation
var transport: Transport
## Enregistrement de la partie (commandes et empreintes), pour le rejeu.
var replay: Replay
## Colonie du joueur local.
var local_colony: int = 0
## Robots des autres colonies, appelés avant chaque tick.
var robots: Array[Robot] = []
## Couleur de chaque colonie, en rangs dans GameText.COLONY_COLORS (vide : l'ordre habituel).
var colors: PackedInt32Array = PackedInt32Array()
## Vitesse du temps (×1, ×2 ou ×4).
var speed: int = 1
## Vrai si le temps est arrêté.
var paused: bool = false
## Production de la colonie locale à chaque tick joué (millièmes par seconde), pour la courbe.
var production_history: PackedInt64Array = PackedInt64Array()

var _time_control: bool = false
var _spectator: bool = false
var _speeds: Array[int] = SPEEDS
var _accumulator: float = 0.0
var _running: bool = false


## Lance une partie locale. « time_control » permet la pause et la vitesse (Bac à sable).
## « sectors » : secteur de chaque colonie (vide : les « colony_count » premiers secteurs).
func start_local(
	defs: SimDefs,
	game_seed: int,
	colony_count: int = -1,
	time_control: bool = false,
	sectors := PackedInt32Array()
) -> void:
	var count: int = defs.sectors if colony_count < 0 else colony_count
	if not sectors.is_empty():
		count = sectors.size()
	replay = Replay.new(defs, game_seed, count, sectors)
	simulation = Simulation.new(defs, game_seed, count, sectors)
	transport = LocalTransport.new(simulation, replay)
	_begin(time_control, false)


## Rejoue une partie enregistrée, en spectateur.
func start_replay(recording: Replay) -> void:
	replay = recording
	var replay_transport := ReplayTransport.new(recording)
	simulation = replay_transport.simulation
	transport = replay_transport
	_begin(true, true)


## Passe la partie en spectateur : plus aucun ordre, pause et vitesses de ×1 à ×64.
func set_spectator() -> void:
	_spectator = true
	_time_control = true
	_speeds = SPECTATOR_SPEEDS


## Fait jouer un robot pour une colonie de la partie (commandes envoyées avant chaque tick).
func add_robot(robot: Robot) -> void:
	robots.append(robot)


func _begin(time_control: bool, spectator: bool) -> void:
	transport.tick_received.connect(_on_tick_received)
	_time_control = time_control
	_spectator = spectator
	_speeds = SPECTATOR_SPEEDS if spectator else SPEEDS
	robots = []
	_accumulator = 0.0
	speed = 1
	paused = false
	production_history = PackedInt64Array()
	_running = true


## Vrai si la pause et la vitesse sont permises.
func has_time_control() -> bool:
	return _time_control


## Vrai si on regarde la partie sans y jouer.
func is_spectator() -> bool:
	return _spectator


## Vitesses permises, dans l'ordre du bouton.
func speeds() -> Array[int]:
	return _speeds


## Vrai tant que la partie tourne (pas encore terminée).
func is_running() -> bool:
	return _running


## Vrai si le joueur peut donner des ordres : partie en cours, pas en pause.
func accepts_commands() -> bool:
	return _running and not paused and not _spectator


## Envoie une commande de la colonie locale, jouée au prochain tick. Refusée (faux) pendant la
## pause ou une fois la partie terminée (décidé le 4 octobre 2026).
func send_command(command: Command) -> bool:
	if not accepts_commands():
		return false
	command.colony_id = local_colony
	transport.send_command(command)
	return true


## Colonie dont le nom s'affiche « Toi » (−1 en spectateur : chaque colonie garde sa couleur).
func viewer_colony() -> int:
	return -1 if _spectator else local_colony


## Colonie du joueur local (en spectateur, celle que suit le panneau).
func colony() -> ColonyState:
	return simulation.state.colony(local_colony)


## Met en pause ou relance le temps (Bac à sable seulement).
func set_paused(value: bool) -> void:
	if not _time_control or value == paused:
		return
	paused = value
	paused_changed.emit(paused)


## Change la vitesse (Bac à sable : ×1, ×2 ou ×4 ; spectateur : ×1 à ×64).
func set_speed(value: int) -> void:
	if not _time_control or not _speeds.has(value) or value == speed:
		return
	speed = value
	speed_changed.emit(speed)


## Passe à la vitesse suivante (×1 → ×2 → ×4 → ×1 ; en spectateur ×1 → ×4 → ×16 → ×64 → ×1).
func cycle_speed() -> void:
	set_speed(_speeds[(_speeds.find(speed) + 1) % _speeds.size()])


## Avancement vers le prochain tick (0 à 1), pour interpoler l'affichage.
func tick_fraction() -> float:
	return clampf(_accumulator, 0.0, 1.0)


## Fait avancer le temps réel de « seconds » secondes ; joue les ticks dus.
func advance_time(seconds: float) -> void:
	if not _running or paused:
		return
	_accumulator += seconds * speed
	var limit: int = MAX_SPECTATOR_TICKS_PER_FRAME if _spectator else MAX_TICKS_PER_FRAME
	var played: int = 0
	while _accumulator >= 1.0 and played < limit:
		_accumulator -= 1.0
		step()
		played += 1
	if played == limit:
		_accumulator = minf(_accumulator, 1.0)


## Arrête la partie pour le joueur (éliminé contre les robots) : plus aucun tick, et
## « game_finished » est émis.
func stop() -> void:
	if not _running:
		return
	_running = false
	game_finished.emit()


## Joue un tick tout de suite (sans effet une fois la partie terminée) : les robots décident
## d'abord, sur l'état du tick précédent, comme un joueur.
func step() -> void:
	if not _running:
		return
	for robot: Robot in robots:
		for command: Command in robot.decide(simulation):
			transport.send_command(command)
	transport.advance()


func _process(delta: float) -> void:
	advance_time(delta)


func _on_tick_received(result: TickResult) -> void:
	var local: ColonyState = colony()
	if local != null:
		production_history.append(local.production)
	ticked.emit(result)
	if result.finished and _running:
		_running = false
		game_finished.emit()
