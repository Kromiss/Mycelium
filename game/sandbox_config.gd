class_name SandboxConfig
extends RefCounted
## Réglages d'une partie de Bac à sable (GDD §2.1 bis) : forêt, graine et chiffres de la partie.
## Ils ne sont pas gardés d'un lancement à l'autre : chaque passage par l'écran de réglages
## repart des valeurs par défaut ; seuls « Rejouer » et « Recommencer » les réutilisent.

## Mode dont la forêt est utilisée (« duel » ou « ffa »).
var mode: ModeDef
## Graine de la partie.
var game_seed: int = 0
## Chiffres de la partie (copie modifiable des données).
var defs: SimDefs


## Réglages par défaut pour un mode, avec une graine donnée.
static func defaults(game_mode: ModeDef, seed_value: int) -> SandboxConfig:
	var config := SandboxConfig.new()
	config.mode = game_mode
	config.game_seed = seed_value
	config.defs = SimDefs.from_mode(game_mode)
	return config


## Copie indépendante, pour relancer une partie avec les mêmes réglages.
func duplicate_config() -> SandboxConfig:
	var copy := SandboxConfig.new()
	copy.mode = mode
	copy.game_seed = game_seed
	copy.defs = defs.duplicate_defs()
	return copy
