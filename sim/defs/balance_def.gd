class_name BalanceDef
extends Resource
## Constantes générales d'équilibrage (GDD §5 à §12, §15). Valeurs de départ à simuler.
## Les quantités (nutriments, PV, dégâts) sont en millièmes, les multiplicateurs en pour-mille.

# --- Économie (§8) ---
## U : unité de coût des améliorations, en millièmes (30 nutriments).
@export var unit_cost: int = 30_000
## Rendement d'une case de zone 1, en millièmes de nutriment par seconde.
@export var cell_yield: int = 3_333
## Stock de départ, en multiples de U.
@export var start_stock_units: int = 0
## Cohésion : production en plus par voisine possédée (+5 %) et plafond (+30 %).
@export var cohesion_production_pm: int = 50
@export var cohesion_production_cap_pm: int = 300
## Armillaire : bonus de production qui monte de 0 à cette valeur sur la durée maximale (+25 %).
@export var strain_bonus_pm: int = 250
## Facteur de coût par niveau d'amélioration (×1,15).
@export var upgrade_cost_growth_pm: int = 1150
## Zone à partir de laquelle une case est « profonde » (mutation Racines profondes).
@export var deep_zone: int = 4

# --- Cases (§6, §7) ---
## PV de base d'une case, en millièmes (40 PV).
@export var cell_hp: int = 40_000
## Cohésion : PV en plus par voisine possédée (+15 %).
@export var cohesion_hp_pm: int = 150
## Régénération : part des PV max regagnée par seconde (2 %).
@export var regen_pm: int = 20
## PV d'une case adverse prise, en part de ses PV max (25 %). Une case libre prise arrive à
## pleine vie (décidé le 4 octobre 2026).
@export var captured_hp_pm: int = 250

# --- Tourelle (§5, §6.3, §7.3, §7.4) ---
## Dégâts d'une spore, en millièmes (5, décidé le 5 octobre 2026).
@export var turret_damage: int = 5_000
## Tirs par seconde, en pour-mille (0,2 tir/s : un tir toutes les 5 s, décidé le 5 octobre 2026).
@export var turret_rate_pm: int = 200
## Portée de départ, en cases (2, décidé le 5 octobre 2026).
@export var turret_range: int = 2
## Spores par tir au départ.
@export var turret_spores: int = 1
## PV de la Tourelle, en nombre de PV de base d'une case (10 × 40 = 400, décidé le 4 octobre 2026).
@export var turret_hp_cells: int = 10
## Soin d'une spore, en part des dégâts (50 %).
@export var heal_pm: int = 500
## Multiplicateur des dégâts d'un coup critique (×3).
@export var crit_damage_pm: int = 3000

# --- Partie (§3, §12) ---
## Durée maximale d'une partie, en secondes (ticks) : 30 min.
@export var match_ticks: int = 1800
## Protection de départ, en secondes : aucune case adverse visée, aucune capacité.
@export var protection_ticks: int = 120
## Trophée : production en plus par Tourelle abattue (+25 %) et Enzymes reçues (100).
@export var trophy_production_pm: int = 250
@export var trophy_enzymes: int = 100
## Nombre de mutations proposées à chaque palier.
@export var mutation_choices: int = 3

# --- Bâtiments (§5 bis) ---
## Places de bâtiment gagnées à chaque palier (1 au palier 1, +1 par palier).
@export var building_slots_per_tier: int = 1
## PV d'un bâtiment au début de son chantier, en part de ses PV max (10 %).
@export var building_start_hp_pm: int = 100
## Durée du sommeil d'un bâtiment tombé, en secondes (60).
@export var building_sleep_ticks: int = 60
## Revenu lent d'Enzymes (décidé le 6 octobre 2026) : chaque colonie en vie reçoit
## « enzyme_income » Enzymes entières toutes les « enzyme_income_ticks » secondes (0 : aucun).
@export var enzyme_income: int = 1
@export var enzyme_income_ticks: int = 10
