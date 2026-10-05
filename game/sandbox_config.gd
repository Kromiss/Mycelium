class_name SandboxConfig
extends RefCounted
## Réglages d'une partie de Bac à sable (GDD §2.1 bis) : forêt, graine, robots et chiffres de
## la partie. Le joueur est sur le premier secteur ; chaque autre secteur reçoit un robot d'un
## profil, ou reste vide. En spectateur (rejeu d'une partie du panneau de simulations), il n'y
## a pas de joueur : le premier secteur a lui aussi son robot, ou reste vide.
## Ils ne sont pas gardés d'un lancement à l'autre : chaque passage par l'écran de réglages
## repart des valeurs par défaut ; seuls « Rejouer » et « Recommencer » les réutilisent.

## Mode dont la forêt est utilisée (« duel » ou « ffa »).
var mode: ModeDef
## Graine de la partie.
var game_seed: int = 0
## Chiffres de la partie (copie modifiable des données).
var defs: SimDefs
## Profil du robot de chaque secteur (&"" : aucun robot ; le premier secteur est celui du
## joueur, sauf en spectateur).
var profiles: Array[StringName] = []
## Vrai s'il n'y a pas de joueur : on regarde une partie de robots (sans ordres, ×1 à ×64).
var spectator: bool = false
## Titre affiché en spectateur (déjà traduit), vide sinon.
var title: String = ""


## Réglages par défaut pour un mode, avec une graine donnée : le joueur seul sur la forêt.
static func defaults(game_mode: ModeDef, seed_value: int) -> SandboxConfig:
	var config := SandboxConfig.new()
	config.mode = game_mode
	config.game_seed = seed_value
	config.defs = SimDefs.from_mode(game_mode)
	config.fit_profiles()
	return config


## Ajuste la liste des profils au nombre de secteurs de la forêt (secteurs ajoutés vides).
func fit_profiles() -> void:
	var count: int = maxi(1, defs.sectors)
	while profiles.size() > count:
		profiles.pop_back()
	while profiles.size() < count:
		profiles.append(&"")


## Profil du robot d'un secteur adverse (rang 0 : deuxième secteur).
func opponent(index: int) -> StringName:
	return profiles[index + 1]


## Nombre de secteurs adverses (tous sauf celui du joueur).
func opponent_count() -> int:
	return profiles.size() - 1


## Vrai si le secteur a une colonie : le joueur (hors spectateur) ou un robot.
func has_colony(sector: int) -> bool:
	return (sector == 0 and not spectator) or profiles[sector] != &""


## Secteur de chaque colonie de la partie, dans l'ordre des colonies.
func colony_sectors() -> PackedInt32Array:
	var sectors := PackedInt32Array()
	for sector: int in range(profiles.size()):
		if has_colony(sector):
			sectors.append(sector)
	return sectors


## Profil du robot de chaque colonie de la partie (&"" pour le joueur), dans l'ordre des colonies.
func colony_profiles() -> Array[StringName]:
	var result: Array[StringName] = []
	for sector: int in colony_sectors():
		result.append(profiles[sector] if spectator or sector > 0 else &"")
	return result


## Copie indépendante, pour relancer une partie avec les mêmes réglages.
func duplicate_config() -> SandboxConfig:
	var copy := SandboxConfig.new()
	copy.mode = mode
	copy.game_seed = game_seed
	copy.defs = defs.duplicate_defs()
	copy.profiles = profiles.duplicate()
	copy.spectator = spectator
	copy.title = title
	return copy
