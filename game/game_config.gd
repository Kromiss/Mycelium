class_name GameConfig
extends RefCounted
## Réglages d'une partie locale : forêt, graine, robots, chiffres de la partie, secteur et
## couleurs.
## - Bac à sable (GDD §2.1 bis) : le joueur est sur le premier secteur, en Menthe ; chaque autre
##   secteur reçoit un robot ou reste vide. Les réglages ne sont pas gardés d'un lancement à
##   l'autre : chaque passage par l'écran de réglages repart des valeurs par défaut ; seuls
##   « Rejouer » et « Recommencer » les réutilisent.
## - Contre les robots (Duel et FFA, G4) : un robot de jeu de la difficulté choisie sur chaque
##   autre secteur ; le secteur du joueur et les couleurs de toutes les colonies sont tirés de
##   la graine ; ni pause ni vitesse.
## - Spectateur (partie regardée depuis le panneau de simulations) : pas de joueur, le premier
##   secteur a lui aussi son robot, ou reste vide.

## Sorte de partie.
enum Kind { SANDBOX, VERSUS }

## Sel des tirages du secteur et des couleurs (distinct des tirages de la partie).
const DRAW_SALT: int = 9_001

## Sorte de partie.
var kind: Kind = Kind.SANDBOX
## Mode dont la forêt est utilisée (« duel » ou « ffa »).
var mode: ModeDef
## Graine de la partie.
var game_seed: int = 0
## Chiffres de la partie (copie modifiable des données).
var defs: SimDefs
## Robot de chaque secteur (&"" : aucun ; identifiants de RobotCatalog). Le secteur du joueur
## reste vide.
var profiles: Array[StringName] = []
## Secteur du joueur.
var player_sector: int = 0
## Couleur de chaque colonie, dans l'ordre des colonies : rang dans GameText.COLONY_COLORS
## (vide : l'ordre habituel, Menthe d'abord).
var colors: PackedInt32Array = PackedInt32Array()
## Difficulté des robots (contre les robots ; &"" sinon).
var difficulty: StringName = &""
## Vrai s'il n'y a pas de joueur : on regarde une partie de robots (sans ordres, ×1 à ×64).
var spectator: bool = false
## Titre affiché en spectateur (déjà traduit), vide sinon.
var title: String = ""


## Réglages par défaut pour un mode, avec une graine donnée : le joueur seul sur la forêt.
static func defaults(game_mode: ModeDef, seed_value: int) -> GameConfig:
	var config := GameConfig.new()
	config.mode = game_mode
	config.game_seed = seed_value
	config.defs = SimDefs.from_mode(game_mode)
	config.fit_profiles()
	return config


## Partie contre les robots (GDD §2.2, §2.3) : un robot de jeu de la difficulté sur chaque
## autre secteur, secteur du joueur et couleurs tirés de la graine.
static func versus(game_mode: ModeDef, seed_value: int, difficulty_id: StringName) -> GameConfig:
	var config: GameConfig = defaults(game_mode, seed_value)
	config.kind = Kind.VERSUS
	config.difficulty = difficulty_id
	var rng: SimRng = SimRng.new(seed_value).derive(DRAW_SALT)
	config.player_sector = rng.range_int(config.profiles.size())
	var robot: StringName = StringName(RobotCatalog.GAME_PREFIX + String(difficulty_id))
	for sector: int in range(config.profiles.size()):
		config.profiles[sector] = &"" if sector == config.player_sector else robot
	var order := PackedInt32Array()
	for index: int in range(GameText.COLONY_COLORS.size()):
		order.append(index)
	for i: int in range(order.size() - 1, 0, -1):
		var j: int = rng.range_int(i + 1)
		var swap: int = order[i]
		order[i] = order[j]
		order[j] = swap
	config.colors = order.slice(0, config.profiles.size())
	return config


## Vrai pour une partie contre les robots.
func is_versus() -> bool:
	return kind == Kind.VERSUS


## Ajuste la liste des robots au nombre de secteurs de la forêt (secteurs ajoutés vides).
func fit_profiles() -> void:
	var count: int = maxi(1, defs.sectors)
	while profiles.size() > count:
		profiles.pop_back()
	while profiles.size() < count:
		profiles.append(&"")


## Robot d'un secteur adverse du Bac à sable (rang 0 : deuxième secteur).
func opponent(index: int) -> StringName:
	return profiles[index + 1]


## Nombre de secteurs adverses du Bac à sable (tous sauf le premier, celui du joueur).
func opponent_count() -> int:
	return profiles.size() - 1


## Vrai si le joueur est sur ce secteur (jamais en spectateur).
func is_player_sector(sector: int) -> bool:
	return sector == player_sector and not spectator


## Vrai si le secteur a une colonie : le joueur (hors spectateur) ou un robot.
func has_colony(sector: int) -> bool:
	return is_player_sector(sector) or profiles[sector] != &""


## Secteur de chaque colonie de la partie, dans l'ordre des colonies.
func colony_sectors() -> PackedInt32Array:
	var sectors := PackedInt32Array()
	for sector: int in range(profiles.size()):
		if has_colony(sector):
			sectors.append(sector)
	return sectors


## Robot de chaque colonie de la partie (&"" pour le joueur), dans l'ordre des colonies.
func colony_profiles() -> Array[StringName]:
	var result: Array[StringName] = []
	for sector: int in colony_sectors():
		result.append(&"" if is_player_sector(sector) else profiles[sector])
	return result


## Colonie du joueur (en spectateur : la première).
func player_colony() -> int:
	return maxi(0, colony_sectors().find(player_sector)) if not spectator else 0


## Copie indépendante, pour relancer une partie avec les mêmes réglages.
func duplicate_config() -> GameConfig:
	var copy := GameConfig.new()
	copy.kind = kind
	copy.mode = mode
	copy.game_seed = game_seed
	copy.defs = defs.duplicate_defs()
	copy.profiles = profiles.duplicate()
	copy.player_sector = player_sector
	copy.colors = colors.duplicate()
	copy.difficulty = difficulty
	copy.spectator = spectator
	copy.title = title
	return copy


## Réglages de « Rejouer » : contre les robots, une nouvelle partie (nouvelle graine, mêmes
## mode et difficulté) ; sinon les mêmes réglages.
func replay_config() -> GameConfig:
	if is_versus():
		return versus(mode, randi() % 1_000_000_000, difficulty)
	return duplicate_config()
