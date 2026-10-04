class_name UpgradeDef
extends Resource
## Une amélioration à niveaux du panneau (GDD §9) : chaque niveau ajoute le même effet et
## coûte « coût de base × facteur ^ niveau déjà atteint ».

## Onglet du panneau.
enum Tab { ATTACK, DEFENSE, ECONOMY }
## Ce que l'amélioration change. L'unité de « effect » dépend de la statistique :
## pour-mille pour DAMAGE, RATE, YIELD, HEAL, CELL_HP, SPLASH, CRIT, TURRET_HP ; pour-mille des
## PV max par seconde pour REGEN ; nombre entier pour RANGE (cases), SPORES et BOUNCE (cases).
enum Stat {
	DAMAGE, RATE, RANGE, YIELD, REGEN, HEAL, SPORES, CELL_HP, SPLASH, CRIT, TURRET_HP, BOUNCE
}

## Identifiant technique (« damage », « rate »…).
@export var id: StringName = &""
## Clés de traduction du nom et de l'effet.
@export var name_key: String = ""
@export var tab: Tab = Tab.ATTACK
@export var stat: Stat = Stat.DAMAGE
## Effet d'un niveau.
@export var effect: int = 0
## Coût du premier niveau, en U (GDD §9.2).
@export var base_cost_units: int = 1
## Facteur de coût par niveau, en pour-mille (0 : le facteur général, ×1,15).
@export var cost_growth_pm: int = 0
## Niveau maximal (0 : sans limite).
@export var max_level: int = 0
## Palier de colonie qui la débloque (0 : dès le départ).
@export var unlock_tier: int = 0
