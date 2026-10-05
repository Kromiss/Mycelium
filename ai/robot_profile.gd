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
## Priorité de tir habituelle (ColonyState.Priority).
@export var priority: int = ColonyState.Priority.CLOSEST
## Priorité de tir quand ses cases sont attaquées (−1 : il garde la priorité habituelle).
@export var defense_priority: int = -1
## Durée minimale de la priorité de défense, en secondes, pour ne pas changer de priorité à
## chaque tick (changer de priorité lâche les cibles gardées).
@export var defense_hold_ticks: int = 10
## Vrai s'il désigne au clic la Tourelle adverse dès qu'il peut la viser.
@export var hunts_turrets: bool = false
## Identifiants des capacités qu'il lance.
@export var abilities: Array[StringName] = []


## Poids d'une amélioration (0 si absente).
func upgrade_weight(upgrade: StringName) -> int:
	return upgrade_weights.get(upgrade, 0)


## Poids d'une mutation (0 si absente).
func mutation_weight(mutation: StringName) -> int:
	return mutation_weights.get(mutation, 0)
