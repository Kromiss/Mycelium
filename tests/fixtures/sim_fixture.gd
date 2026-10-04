extends RefCounted
## Outils communs aux tests de la simulation : parties de Duel prêtes à l'emploi, cases données
## à une colonie, ticks joués avec des commandes.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
## Cases de départ de la colonie 0 en Duel (rayon 11) : Tourelle, case vers le centre, case
## sur le bord.
const TURRET_0 := Vector2i(11, 0)
const INNER_0 := Vector2i(10, 0)
const EDGE_0 := Vector2i(11, -1)


## Définitions de Duel, sans régénération si « regen » est faux (calculs de PV plus simples).
static func duel_defs(regen: bool = true) -> SimDefs:
	var defs: SimDefs = SimDefs.from_mode(DUEL)
	if not regen:
		defs.regen_pm = 0
	return defs


## Partie de Duel à « colonies » colonies (graine 1).
static func duel(colonies: int = 1, regen: bool = true) -> Simulation:
	return Simulation.new(duel_defs(regen), 1, colonies)


## Numéro d'une case.
static func cell(sim: Simulation, coords: Vector2i) -> int:
	return sim.cell_index(coords)


## Donne des cases à une colonie (à pleine vie), en retirant chaque case à son ancien
## propriétaire.
static func give(sim: Simulation, colony_id: int, cells: Array[Vector2i]) -> void:
	var state: GameState = sim.state
	for coords: Vector2i in cells:
		var index: int = sim.cell_index(coords)
		var previous: ColonyState = state.owner_of(index)
		if previous != null:
			previous.cell_count -= 1
		state.owner[index] = colony_id
		state.colonies[colony_id].cell_count += 1
	refill(sim)


## Remet toutes les cases à pleine vie.
static func refill(sim: Simulation) -> void:
	for index: int in range(sim.state.cell_count()):
		sim.state.hp[index] = sim.cell_max_hp(index)
		sim.state.last_hitter[index] = -1


## Joue « count » ticks ; « commands » est joué au premier.
static func run(sim: Simulation, count: int, commands: Array[Command] = []) -> TickResult:
	var result: TickResult = sim.tick(commands)
	for i: int in range(count - 1):
		result = sim.tick()
	return result


## Ligne de cases de la colonie 0 qui part de la Tourelle vers le centre (q décroît), de
## longueur « length » (cases de départ comprises).
static func line_to_center(length: int) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	for i: int in range(length):
		cells.append(Vector2i(11 - i, 0))
	return cells
