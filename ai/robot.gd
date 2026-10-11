class_name Robot
extends RefCounted
## Robot d'une colonie (GDD §2.5, Architecture §6). Il lit l'état sans le modifier et renvoie,
## à chaque tick, les commandes qu'un joueur pourrait envoyer : mêmes règles, mêmes commandes,
## pas de triche. Son profil (RobotProfile) oriente ses choix :
## - mutation : la plus lourde des cartes proposées (tirage à graine en cas d'égalité) ;
## - points chauds : un par place libre, selon le but de la place (HotspotPlanner) ; un point
##   chaud n'est reposé que quand le sien a disparu (case prise, Sporophore abattu) ;
## - améliorations : meilleur rapport poids / coût (UpgradePlanner).
## Une difficulté (RobotDifficulty, robots de jeu) règle son rythme et ses erreurs : il n'agit
## qu'une seconde sur N, fait des achats ou prend des mutations au hasard, ne vise pas les
## Sporophores adverses.
## Son aléatoire est un SimRng dérivé de la graine : une partie de robots se rejoue à l'identique.

## Décalage du sel de l'aléatoire des robots (distinct des autres tirages de la partie).
const RNG_SALT: int = 7_001

var profile: RobotProfile
## Difficulté (null : aucune, le robot agit chaque seconde sans erreur).
var difficulty: RobotDifficulty
var colony_id: int = 0

var _rng: SimRng
## But de chacun de ses points chauds (case → but de HotspotPlanner).
var _goals: Dictionary[int, StringName] = {}


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
	_add(simulation, commands, _mutation_command(state, colony))
	_add(simulation, commands, _hotspot_command(simulation, colony))
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


## Pose un point chaud sur une place libre, selon le but qui manque.
func _hotspot_command(simulation: Simulation, colony: ColonyState) -> Command:
	var state: GameState = simulation.state
	for cell: int in _goals.keys():
		if not colony.hotspots.has(cell):
			_goals.erase(cell)
	var goals: Array[StringName] = []
	for cell: int in colony.hotspots:
		goals.append(_goals.get(cell, &""))
	var goal: StringName = HotspotPlanner.next_goal(
		profile, simulation.max_hotspots(colony_id), goals
	)
	if goal == &"":
		return null
	var hunts: bool = difficulty == null or difficulty.hunts_turrets
	var cell: int = HotspotPlanner.pick(state, colony, profile, goal, hunts, colony.hotspots)
	if cell < 0:
		return null
	_goals[cell] = goal
	return HotspotCommand.new(state.map.cells[cell], colony_id)
