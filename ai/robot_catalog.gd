class_name RobotCatalog
extends RefCounted
## Les robots (GDD §2.5) : profils Canonnier, Bâtisseur et Conquérant (panneau de simulations et
## Bac à sable) et robot de jeu équilibré avec ses trois difficultés (Duel et FFA, Bac à sable).
## Un robot se désigne par un identifiant : celui d'un profil (« gunner »), ou « game_ » suivi
## d'une difficulté (« game_normal ») pour le robot de jeu.

const GUNNER: RobotProfile = preload("res://ai/profiles/gunner.tres")
const BUILDER: RobotProfile = preload("res://ai/profiles/builder.tres")
const CONQUEROR: RobotProfile = preload("res://ai/profiles/conqueror.tres")
## Robot de jeu (réglage interne équilibré) et ses difficultés.
const GAME_ROBOT: RobotProfile = preload("res://data/robots/game_robot.tres")
const EASY: RobotDifficulty = preload("res://data/robots/easy.tres")
const NORMAL: RobotDifficulty = preload("res://data/robots/normal.tres")
const HARD: RobotDifficulty = preload("res://data/robots/hard.tres")
## Préfixe des identifiants du robot de jeu.
const GAME_PREFIX: String = "game_"
## Clé de traduction de « aucun robot ».
const NONE_KEY: String = "ROBOT_NONE"


## Tous les profils, dans l'ordre d'affichage.
static func profiles() -> Array[RobotProfile]:
	var list: Array[RobotProfile] = [GUNNER, BUILDER, CONQUEROR]
	return list


## Les difficultés du robot de jeu, de la plus facile à la plus difficile.
static func difficulties() -> Array[RobotDifficulty]:
	var list: Array[RobotDifficulty] = [EASY, NORMAL, HARD]
	return list


## Identifiant du robot de jeu d'une difficulté (« game_hard »).
static func game_robot_id(difficulty: RobotDifficulty) -> StringName:
	return StringName(GAME_PREFIX + String(difficulty.id))


## Identifiants proposés dans le Bac à sable : aucun, les profils, puis le robot de jeu dans
## chaque difficulté.
static func sandbox_choices() -> Array[StringName]:
	var ids: Array[StringName] = [&""]
	for profile: RobotProfile in profiles():
		ids.append(profile.id)
	for difficulty: RobotDifficulty in difficulties():
		ids.append(game_robot_id(difficulty))
	return ids


## Profil d'un identifiant de profil (null si inconnu, vide ou robot de jeu).
static func find(id: StringName) -> RobotProfile:
	for profile: RobotProfile in profiles():
		if profile.id == id:
			return profile
	return null


## Difficulté d'un identifiant, celui du robot de jeu (« game_easy ») ou la difficulté seule
## (« easy ») ; null sinon.
static func find_difficulty(id: StringName) -> RobotDifficulty:
	var name: String = String(id).trim_prefix(GAME_PREFIX)
	for difficulty: RobotDifficulty in difficulties():
		if String(difficulty.id) == name:
			return difficulty
	return null


## Vrai si l'identifiant désigne un robot connu.
static func exists(id: StringName) -> bool:
	return find(id) != null or (String(id).begins_with(GAME_PREFIX) and find_difficulty(id) != null)


## Robot d'un identifiant pour une colonie (null si l'identifiant est vide ou inconnu).
static func make(id: StringName, colony_id: int, game_seed: int) -> Robot:
	var profile: RobotProfile = find(id)
	if profile != null:
		return Robot.new(profile, colony_id, game_seed)
	if String(id).begins_with(GAME_PREFIX):
		var difficulty: RobotDifficulty = find_difficulty(id)
		if difficulty != null:
			return Robot.new(GAME_ROBOT, colony_id, game_seed, difficulty)
	return null


## Nom traduit d'un robot (« Aucun » pour un identifiant vide ou inconnu ; « Robot · Normal »
## pour le robot de jeu).
static func label(id: StringName) -> String:
	var profile: RobotProfile = find(id)
	if profile != null:
		return TranslationServer.translate(profile.name_key)
	if exists(id):
		var difficulty: String = TranslationServer.translate(find_difficulty(id).name_key)
		return TranslationServer.translate("ROBOT_GAME_LABEL") % difficulty
	return TranslationServer.translate(NONE_KEY)
