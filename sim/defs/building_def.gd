class_name BuildingDef
extends Resource
## Définition d'un bâtiment (GDD §7.2, §7.3). Les multiplicateurs sont en pour-mille.

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
## Coût en multiples de U.
@export var cost_units: int = 1
## Coût en Enzymes (entières).
@export var cost_enzymes: int = 0
## Règle de pose.
@export var placement: Placement = Placement.ANYWHERE
## Nombre maximal par colonie (0 = pas de limite).
@export var max_count: int = 0
## Bonus de rendement de sa case (+50 % = 500).
@export var yield_bonus_pm: int = 0
## Enzymes produites par minute (entières).
@export var enzymes_per_minute: int = 0
## Bonus de voisinage par bâtiment du même type adjacent, et son plafond (§7.3).
@export var neighbor_bonus_pm: int = 0
@export var neighbor_bonus_max_pm: int = 0
## Bonus de Rosace (case entourée de ses 6 voisines possédées) sur tout son effet.
@export var rosace_bonus_pm: int = 0
## Minutes de production ajoutées au plafond de stock.
@export var stock_minutes: int = 0
## Réduction de la durée de pousse dans un rayon (−30 % = 300), et ce rayon.
@export var growth_reduction_pm: int = 0
@export var effect_radius: int = 0
## Chantiers simultanés ajoutés.
@export var extra_sites: int = 0
## Pousses simultanées ajoutées.
@export var extra_growths: int = 0
