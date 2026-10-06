class_name Replay
extends RefCounted
## Enregistrement d'une partie : de quoi la recréer (définitions, graine, nombre de colonies)
## et toutes les commandes reçues, avec le tick où elles ont été appliquées. Rejouer ces
## commandes redonne la même partie, empreinte comprise (Architecture §4.4, GDD §11.4).


## Commandes d'un tick : jouées avant le tick (au clic du joueur local), puis avec le tick.
class Batch:
	extends RefCounted
	var early: Array[Command] = []
	var normal: Array[Command] = []
	## Rang de la commande suivante dans l'enregistrement.
	var next: int = 0


## Version du format, à augmenter si l'enregistrement change (2 : commandes « early » ; 3 : plus de
## commande de pas, les numéros des types de commande ont changé ; 4 : bâtiments, dans les
## définitions et dans l'empreinte).
const FORMAT: int = 4

var defs: SimDefs
var game_seed: int = 0
var colony_count: int = 1
## Secteur de chaque colonie (vide : les premiers secteurs).
var sectors: PackedInt32Array = PackedInt32Array()
## Commandes reçues, en dictionnaires (Command.to_dict()), dans l'ordre d'arrivée.
var commands: Array[Dictionary] = []
## Nombre de ticks joués pendant l'enregistrement.
var ticks: int = 0
## Empreinte de l'état après le dernier tick enregistré.
var final_hash: int = 0


func _init(
	game_defs: SimDefs = null,
	seed_value: int = 0,
	colonies: int = 1,
	sector_list := PackedInt32Array()
) -> void:
	defs = game_defs.duplicate_defs() if game_defs != null else null
	game_seed = seed_value
	colony_count = colonies
	sectors = sector_list.duplicate()


## Enregistre un tick joué : ses commandes (tick renseigné) et l'empreinte obtenue.
func record_tick(tick_commands: Array[Command], result: TickResult) -> void:
	for command: Command in tick_commands:
		commands.append(command.to_dict())
	ticks = result.tick + 1
	final_hash = result.state_hash


## Enregistre des commandes jouées tout de suite, entre deux ticks (Simulation.apply_now()) :
## elles sont rejouées avant le tick qui suit.
func record_early(early_commands: Array[Command]) -> void:
	for command: Command in early_commands:
		var data: Dictionary = command.to_dict()
		data["early"] = true
		commands.append(data)


## Commandes enregistrées pour un tick, lues à partir du rang « from » : celles jouées avant le
## tick (« early ») et celles du tick, et le rang de la suivante.
func batch_at(tick: int, from: int) -> Batch:
	var batch := Batch.new()
	batch.next = from
	while batch.next < commands.size():
		var data: Dictionary = commands[batch.next]
		var at: int = DictRead.get_int(data, "tick", -1)
		if at > tick:
			break
		batch.next += 1
		var command: Command = Command.from_dict(data)
		if at < tick or command == null:
			continue
		if data.get("early", false):
			batch.early.append(command)
		else:
			batch.normal.append(command)
	return batch


## Recrée la partie au départ.
func create_simulation() -> Simulation:
	return Simulation.new(defs.duplicate_defs(), game_seed, colony_count, sectors)


## Rejoue la partie et renvoie l'empreinte de chaque tick.
func play() -> PackedInt64Array:
	var simulation: Simulation = create_simulation()
	var hashes := PackedInt64Array()
	var next: int = 0
	for tick: int in range(ticks):
		var batch: Batch = batch_at(tick, next)
		next = batch.next
		if not batch.early.is_empty():
			simulation.apply_now(batch.early)
		hashes.append(simulation.tick(batch.normal).state_hash)
	return hashes


## Conversion en dictionnaire. Pour un fichier, utiliser var_to_str() : JSON perdrait la
## précision des grands entiers (graine, empreinte).
func to_dict() -> Dictionary:
	return {
		"format": FORMAT,
		"defs": defs.to_dict(),
		"seed": game_seed,
		"colonies": colony_count,
		"sectors": Array(sectors),
		"commands": commands.duplicate(true),
		"ticks": ticks,
		"final_hash": final_hash,
	}


## Reconstruit un enregistrement depuis to_dict(), ou null si le format est inconnu.
static func from_dict(data: Dictionary) -> Replay:
	if DictRead.get_int(data, "format") != FORMAT:
		return null
	var defs_data: Variant = data.get("defs", {})
	if not defs_data is Dictionary:
		return null
	var defs_dict: Dictionary = defs_data
	var replay := Replay.new()
	replay.defs = SimDefs.from_dict(defs_dict)
	replay.game_seed = DictRead.get_int(data, "seed")
	replay.colony_count = DictRead.get_int(data, "colonies", 1)
	replay.sectors = DictRead.get_ints(data, "sectors")
	replay.ticks = DictRead.get_int(data, "ticks")
	replay.final_hash = DictRead.get_int(data, "final_hash")
	var raw: Variant = data.get("commands", [])
	if raw is Array:
		var items: Array = raw
		for item: Variant in items:
			if item is Dictionary:
				var command: Dictionary = item
				replay.commands.append(command)
	return replay
