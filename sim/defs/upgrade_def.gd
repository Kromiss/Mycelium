class_name UpgradeDef
extends Resource
## Une amélioration à niveaux du panneau (GDD §9) : chaque niveau ajoute le même effet et
## coûte « coût de base × facteur ^ niveau déjà atteint ».

## Onglet du panneau.
enum Tab { ATTACK, DEFENSE, ECONOMY }
## Ce que l'amélioration change (G6, décidé le 11 octobre 2026). « effect » est en pour-mille
## pour PUSH (poussée par case), VIGOR (plafond de propagation), YIELD, CELL_HP et TURRET_HP ; en
## pour-mille des PV max par seconde pour REGEN.
enum Stat { PUSH, VIGOR, YIELD, REGEN, CELL_HP, TURRET_HP }

## Identifiant technique (« push », « vigor »…).
@export var id: StringName = &""
## Clés de traduction du nom et de l'effet.
@export var name_key: String = ""
@export var tab: Tab = Tab.ATTACK
@export var stat: Stat = Stat.PUSH
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
