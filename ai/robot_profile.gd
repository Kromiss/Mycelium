class_name RobotProfile
extends Resource
## Profil d'un robot (GDD §2.5, Architecture §6) : les poids qui orientent ses choix. Un
## robot joue avec les mêmes règles et les mêmes commandes qu'un joueur ; son profil ne fait
## que dire ce qu'il préfère. Les chiffres sont dans les fichiers .tres de ai/profiles/.

## Identifiant technique (« gunner », « builder », « conqueror »).
@export var id: StringName = &""
## Clé de traduction du nom.
@export var name_key: String = ""
## Poids de chaque amélioration (identifiant → poids ; absente ou 0 : jamais achetée). Le
## robot achète l'amélioration au meilleur rapport poids / coût.
@export var upgrade_weights: Dictionary[StringName, int] = {}
## Poids de chaque mutation (identifiant → poids) : le robot prend la plus lourde proposée.
@export var mutation_weights: Dictionary[StringName, int] = {}
## But de chaque point chaud, dans l'ordre des places (repris en boucle) : HotspotPlanner.TURRET
## (Sporophore adverse), RICH (case libre riche), CENTER (le centre, puis l'ennemi).
@export var hotspot_goals: Array[StringName] = []
## But RICH : distance maximale (en cases) entre la case visée et le territoire.
@export var rich_reach: int = 3


## Poids d'une amélioration (0 si absente).
func upgrade_weight(upgrade: StringName) -> int:
	return upgrade_weights.get(upgrade, 0)


## Poids d'une mutation (0 si absente).
func mutation_weight(mutation: StringName) -> int:
	return mutation_weights.get(mutation, 0)
