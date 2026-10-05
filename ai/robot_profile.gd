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
## Poids de chaque bâtiment (identifiant → poids ; absent ou 0 : jamais posé) : le robot pose le
## type de plus fort poids rapporté au nombre déjà posé (BuildPlanner).
@export var building_weights: Dictionary[StringName, int] = {}
## Valeur, pour choisir la case d'un bâtiment, de chaque case qu'il pourra viser : case libre,
## plus par numéro de zone (zones riches vers le centre), case adverse ; pour le Mortier,
## Sporophore et bâtiment adverses à portée.
@export var free_cell_value: int = 10
@export var rich_zone_value: int = 0
@export var enemy_cell_value: int = 10
@export var enemy_turret_value: int = 50
@export var enemy_building_value: int = 20


## Poids d'une amélioration (0 si absente).
func upgrade_weight(upgrade: StringName) -> int:
	return upgrade_weights.get(upgrade, 0)


## Poids d'un bâtiment (0 si absent).
func building_weight(building: StringName) -> int:
	return building_weights.get(building, 0)


## Poids d'une mutation (0 si absente).
func mutation_weight(mutation: StringName) -> int:
	return mutation_weights.get(mutation, 0)
