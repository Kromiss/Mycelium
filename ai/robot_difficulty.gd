class_name RobotDifficulty
extends Resource
## Difficulté d'un robot de jeu (GDD §2.5, décidé le 5 octobre 2026) : à quel rythme il agit et
## quelles erreurs il fait. Les valeurs sont dans data/robots/ (à équilibrer).

## Identifiant technique (« easy », « normal », « hard »).
@export var id: StringName = &""
## Clé de traduction du nom.
@export var name_key: String = ""
## Le robot n'agit qu'une seconde sur « act_every_ticks » (1 : chaque seconde).
@export var act_every_ticks: int = 1
## Un achat sur « random_upgrade_one_in » est fait au hasard (0 : jamais).
@export var random_upgrade_one_in: int = 0
## Vrai s'il prend sa mutation au hasard parmi les cartes proposées.
@export var random_mutation: bool = false
## Faux s'il ne vise jamais le Sporophore adverse avec ses points chauds (Facile).
@export var hunts_turrets: bool = true
