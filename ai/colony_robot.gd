class_name ColonyRobot
extends RefCounted
## Robot du panneau de simulations (GDD §14.5, décidé le 4 octobre 2026) : un profil
## d'expansion, un profil de bâtisseur et deux bourses virtuelles. À chaque seconde, ce que la
## colonie a gagné est partagé : X % dans la bourse « expansion », le reste dans la bourse
## « construction » (le stock de départ va à l'expansion) ; si le plafond du stock coupe la
## production, les deux bourses baissent en proportion. Chaque bourse ne dépense que ce qu'elle a :
## une case n'entre dans la file d'expansion que si la bourse d'expansion couvre son coût (débité
## à l'ajout), un bâtiment n'est posé que si la bourse de construction le paie.
## Il lit l'état sans le modifier et renvoie des commandes, comme un joueur.

var spec: RobotSpec
var colony_id: int = 0
## Bourses, en millièmes de nutriment.
var expansion_purse: int = 0
var build_purse: int = 0
## Nombre de cases candidates au dernier choix d'expansion (0 : plus rien à coloniser).
var last_candidate_count: int = 0
## Vrai si, au dernier choix, la construction attendait un chantier ou une place dans la file.
var waiting_for_site: bool = false

var _expansion: EconomyRobot
var _builder: BuilderRobot
var _started: bool = false
## Cases ajoutées à la file par le robot et pas encore démarrées : case → coût réservé.
var _reserved: Dictionary[int, int] = {}


## Robot d'une composition pour une colonie ; son aléatoire est dérivé de la graine de la partie.
func _init(robot_spec: RobotSpec, colony: int, game_seed: int) -> void:
	spec = robot_spec
	colony_id = colony
	_expansion = EconomyRobot.new(spec.expansion, colony, game_seed)
	_builder = BuilderRobot.new(spec.builder, SimRng.new(game_seed).derive(colony + 101))


## Commandes du robot pour le prochain tick : au plus un ajout à la file d'expansion et une pose.
func decide(simulation: Simulation) -> Array[Command]:
	var commands: Array[Command] = []
	var state: GameState = simulation.state
	var colony: ColonyState = state.colony(colony_id)
	waiting_for_site = false
	if colony == null or not colony.alive or state.finished:
		return commands
	_collect(colony)
	if colony.queue_load() < state.defs.expansion_queue_size:
		var cell: int = _expansion.choose(state, colony, expansion_purse)
		last_candidate_count = _expansion.last_candidate_count
		if cell >= 0 and Expansion.cost(state, colony, cell) <= expansion_purse:
			var cost: int = Expansion.cost(state, colony, cell)
			expansion_purse -= cost
			_reserved[cell] = cost
			commands.append(EnqueueCommand.new(state.map.cells[cell], colony_id))
	if spec.builder != BuilderRobot.Profile.NONE:
		var command: Command = _build(state, colony)
		if command != null:
			commands.append(command)
	return commands


## Partage ce que la colonie a gagné depuis la dernière décision entre les deux bourses.
func _collect(colony: ColonyState) -> void:
	var reserved: int = 0
	for cell: int in _reserved.keys():
		if colony.queue.has(cell):
			reserved += _reserved[cell]
		else:
			_reserved.erase(cell)
	var available: int = maxi(0, colony.nutrients - reserved)
	if not _started:
		_started = true
		expansion_purse = available
		build_purse = 0
		return
	var delta: int = available - (expansion_purse + build_purse)
	if delta >= 0:
		@warning_ignore("integer_division")
		var share: int = delta * spec.expansion_share / 100
		expansion_purse += share
		build_purse += delta - share
		return
	# Moins que prévu (plafond du stock, coût réel d'une case) : les deux bourses baissent en
	# proportion.
	var total: int = expansion_purse + build_purse
	if total <= 0:
		expansion_purse = 0
		build_purse = 0
		return
	var kept_expansion: int = int(float(available) * float(expansion_purse) / float(total))
	expansion_purse = kept_expansion
	build_purse = available - kept_expansion


## Pose voulue par le profil de bâtisseur, si la bourse de construction la paie (null sinon).
func _build(state: GameState, colony: ColonyState) -> Command:
	var type: int = _builder.wanted_type(state, colony, build_purse)
	if type < 0:
		return null
	var cost: int = Buildings.cost(state, colony, type)
	var affordable: bool = (
		cost <= build_purse and Buildings.enzyme_cost(state, type) <= colony.enzymes
	)
	if colony.build_load() >= state.defs.build_queue_size:
		waiting_for_site = affordable
		return null
	waiting_for_site = not colony.build_queue.is_empty()
	if not affordable:
		return null
	var cell: int = _builder.best_cell(state, colony, type)
	if cell < 0 or Buildings.check_build(state, colony, cell, type) != Refusal.Code.OK:
		return null
	build_purse -= cost
	return BuildCommand.new(state.map.cells[cell], state.defs.buildings[type].id, colony_id)
