class_name Robot
extends RefCounted
## Robot d'une colonie (GDD §2.5, Architecture §6). Il lit l'état sans le modifier et renvoie,
## à chaque tick, les commandes qu'un joueur pourrait envoyer : mêmes règles, mêmes commandes,
## pas de triche. Son profil (RobotProfile) oriente ses choix :
## - mutation : la plus lourde des cartes proposées (tirage à graine en cas d'égalité) ;
## - priorité de tir : celle du profil, ou sa priorité de défense quand ses cases sont visées ;
## - cible : la Tourelle adverse dès qu'il peut la viser, s'il chasse les Tourelles ;
## - pas : vers le centre de la forêt, derrière son territoire, s'il déplace sa Tourelle ;
## - capacités : Salve quand il tire, Mur sur une case attaquée, Nuage sur les cases adverses ;
## - améliorations : meilleur rapport poids / coût (UpgradePlanner).
## Une difficulté (RobotDifficulty, robots de jeu) règle son rythme et ses erreurs : il n'agit
## qu'une seconde sur N, fait des achats ou prend des mutations au hasard, se prive de
## capacités ou de la chasse aux Tourelles.
## Son aléatoire est un SimRng dérivé de la graine : une partie de robots se rejoue à l'identique.

## Décalage du sel de l'aléatoire des robots (distinct des autres tirages de la partie).
const RNG_SALT: int = 7_001

var profile: RobotProfile
## Difficulté (null : aucune, le robot agit chaque seconde sans erreur).
var difficulty: RobotDifficulty
var colony_id: int = 0

var _rng: SimRng
## Tick jusqu'auquel (exclu) la priorité de défense est gardée.
var _defense_until: int = 0


func _init(
	robot_profile: RobotProfile,
	colony: int,
	game_seed: int,
	robot_difficulty: RobotDifficulty = null
) -> void:
	profile = robot_profile
	difficulty = robot_difficulty
	colony_id = colony
	_rng = SimRng.new(game_seed).derive(RNG_SALT + colony)


## Commandes du robot pour le prochain tick (vide si sa colonie est éliminée ou la partie finie).
func decide(simulation: Simulation) -> Array[Command]:
	var commands: Array[Command] = []
	var state: GameState = simulation.state
	var colony: ColonyState = state.colony(colony_id)
	if colony == null or not colony.alive or state.finished:
		return commands
	if not acts_at(state.tick):
		return commands
	var attacked: PackedInt32Array = Threats.attacked_cells(state, colony)
	_add(simulation, commands, _mutation_command(state, colony))
	_add(simulation, commands, _priority_command(state, colony, attacked))
	_add(simulation, commands, _target_command(simulation, colony))
	for command: Command in _ability_commands(state, colony, attacked):
		_add(simulation, commands, command)
	var random_one_in: int = difficulty.random_upgrade_one_in if difficulty != null else 0
	var plan: Dictionary[int, int] = UpgradePlanner.plan(
		state, colony, profile, _rng, random_one_in
	)
	for index: int in plan:
		var id: StringName = state.defs.upgrades[index].id
		commands.append(BuyUpgradeCommand.new(id, plan[index], colony_id))
	return commands


## Vrai si le robot agit à ce tick : chaque seconde sans difficulté, sinon une seconde sur N
## (décalée selon la colonie, pour que les robots n'agissent pas tous ensemble).
func acts_at(tick: int) -> bool:
	if difficulty == null or difficulty.act_every_ticks <= 1:
		return true
	return (tick + colony_id) % difficulty.act_every_ticks == 0


## Ajoute la commande si elle serait acceptée maintenant.
func _add(simulation: Simulation, commands: Array[Command], command: Command) -> void:
	if command != null and simulation.check(command) == Refusal.Code.OK:
		commands.append(command)


## Choix de la mutation la plus lourde du premier choix en attente.
func _mutation_command(state: GameState, colony: ColonyState) -> Command:
	if colony.pending_offers.is_empty():
		return null
	var best := PackedInt32Array()
	var best_weight: int = -1
	for choice: int in range(state.defs.mutation_choices):
		var mutation: int = colony.pending_offers[choice]
		if mutation < 0:
			continue
		var weight: int = profile.mutation_weight(state.defs.mutations[mutation].id)
		if difficulty != null and difficulty.random_mutation:
			# Mutation au hasard : toutes les cartes se valent.
			weight = 0
		if weight > best_weight:
			best = PackedInt32Array([choice])
			best_weight = weight
		elif weight == best_weight:
			best.append(choice)
	if best.is_empty():
		return null
	var picked: int = best[_rng.range_int(best.size())] if best.size() > 1 else best[0]
	return ChooseMutationCommand.new(picked, colony_id)


## Priorité de tir voulue : celle de défense tant que ses cases sont visées (et un peu après).
func _priority_command(
	state: GameState, colony: ColonyState, attacked: PackedInt32Array
) -> Command:
	var wanted: int = profile.priority
	if profile.defense_priority >= 0:
		if not attacked.is_empty():
			_defense_until = state.tick + profile.defense_hold_ticks
		if state.tick < _defense_until:
			wanted = profile.defense_priority
	if wanted == colony.priority:
		return null
	return SetPriorityCommand.new(wanted, colony_id)


## Désigne la Tourelle adverse visable la plus proche, s'il chasse les Tourelles.
func _target_command(simulation: Simulation, colony: ColonyState) -> Command:
	if not profile.hunts_turrets or (difficulty != null and not difficulty.hunts_turrets):
		return null
	var state: GameState = simulation.state
	if colony.designated >= 0 and state.is_turret_cell(colony.designated):
		return null
	var best: int = -1
	var best_distance: int = 0
	for other: ColonyState in state.colonies:
		if other.id == colony.id or not other.alive or other.turret < 0:
			continue
		if not simulation.is_target(colony.id, other.turret):
			continue
		var distance: int = state.distance(colony.turret, other.turret)
		if best < 0 or distance < best_distance:
			best = other.turret
			best_distance = distance
	if best < 0:
		return null
	return TargetCommand.new(state.map.cells[best], colony_id)


## Capacités prêtes et payables (Enzymes partagées entre elles), chacune sur sa case.
func _ability_commands(
	state: GameState, colony: ColonyState, attacked: PackedInt32Array
) -> Array[Command]:
	var commands: Array[Command] = []
	if colony.turret < 0:
		return commands
	var enzymes: int = colony.enzymes
	for id: StringName in profile.abilities:
		if difficulty != null and not difficulty.abilities.has(id):
			continue
		var index: int = state.defs.ability_index(id)
		if index < 0:
			continue
		var ability: SimAbility = state.defs.abilities[index]
		var cost: int = Fixed.from_units(ability.cost_enzymes)
		if cost > enzymes:
			continue
		# La case de la Tourelle sert à tout vérifier sauf la case choisie.
		if Abilities.check_use(state, colony, index, colony.turret) != Refusal.Code.OK:
			continue
		var cell: int = -1
		match ability.kind:
			AbilityDef.Kind.SALVO:
				if colony.designated >= 0 or not colony.targets.is_empty():
					cell = colony.turret
			AbilityDef.Kind.WALL:
				cell = Threats.closest_to_turret(state, colony, attacked)
			AbilityDef.Kind.CLOUD:
				cell = _cloud_cell(state, colony, ability)
		if cell < 0:
			continue
		enzymes -= cost
		commands.append(UseAbilityCommand.new(id, state.map.cells[cell], colony_id))
	return commands


## Case adverse à portée dont la zone du Nuage touche une Tourelle adverse, sinon le plus de
## cases adverses (−1 : aucune case adverse à portée).
func _cloud_cell(state: GameState, colony: ColonyState, ability: SimAbility) -> int:
	var reach: int = ColonyStats.turret_range(state.defs, colony)
	var best: int = -1
	var best_turret: bool = false
	var best_count: int = 0
	for cell: int in state.map.disk(colony.turret, reach):
		var owner: int = state.owner[cell]
		if owner < 0 or owner == colony.id:
			continue
		var count: int = 0
		var turret: bool = false
		for other: int in state.map.disk(cell, ability.radius):
			var other_owner: int = state.owner[other]
			if other_owner >= 0 and other_owner != colony.id:
				count += 1
				turret = turret or state.is_turret_cell(other)
		if (
			best < 0
			or (turret and not best_turret)
			or (turret == best_turret and count > best_count)
		):
			best = cell
			best_turret = turret
			best_count = count
	return best
