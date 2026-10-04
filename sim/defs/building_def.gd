class_name BuildingDef
extends Resource
## Définition d'un bâtiment (GDD §7.2). Les multiplicateurs sont en pour-mille. Depuis le
## 4 octobre 2026, les bâtiments de production agissent sur une zone (rayon « effect_radius ») et
## n'ont plus de bonus de voisinage ni de Rosace.

enum Placement {
	## N'importe quelle case possédée.
	ANYWHERE,
	## Une case qui touche au moins une case non possédée (GDD §7.4).
	FRONTIER,
	## Une case qui ne touche que des cases possédées.
	INNER,
}

## Identifiant technique (« digestion_node »…).
@export var id: StringName = &""
## Clé de traduction du nom.
@export var name_key: String = ""
## Palier de colonie qui le débloque (0 = dès le départ ; ne se désactive alors jamais).
@export var unlock_tier: int = 0
## Coût minimal en multiples de U.
@export var cost_units: int = 1
## Coût en secondes de production actuelle de la colonie (au moins « cost_units » U).
@export var cost_seconds: int = 0
## Coût en Enzymes (entières).
@export var cost_enzymes: int = 0
## Règle de pose.
@export var placement: Placement = Placement.ANYWHERE
## Nombre maximal par colonie (0 = pas de limite).
@export var max_count: int = 0
## Bonus de production des cases de la colonie dans son rayon (+30 % = 300 ; ne se cumule pas).
@export var yield_bonus_pm: int = 0
## Enzymes par minute pour chaque case de la colonie dans son rayon (ne se cumule pas).
@export var enzymes_per_cell_minute: int = 0
## Minutes de production ajoutées au plafond de stock.
@export var stock_minutes: int = 0
## Réduction de la durée de pousse dans son rayon (−30 % = 300).
@export var growth_reduction_pm: int = 0
## Rayon de l'effet (rendement, Enzymes ou pousse), en cases.
@export var effect_radius: int = 0
## Chantiers simultanés ajoutés.
@export var extra_sites: int = 0
## Pousses simultanées ajoutées.
@export var extra_growths: int = 0
