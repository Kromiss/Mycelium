class_name Palette
extends Resource
## Couleurs d'un thème (clair ou sombre), d'après la direction artistique du GDD (§13.2 et §13.3).

## Fond de l'écran.
@export var background: Color = Color("#FBF6EE")
## Fond des cartes, boutons et panneaux.
@export var card: Color = Color("#FFFDF8")
## Texte principal.
@export var text: Color = Color("#3B3340")
## Texte secondaire.
@export var text_secondary: Color = Color("#6E6475")
## Filets et bordures discrètes.
@export var line: Color = Color("#EADFD0")
## Bulle d'une case d'Humus, quand sa couleur ne dépend pas de la zone.
@export var humus: Color = Color("#E2CDB0")
## Si vrai, chaque bulle prend la couleur du fond de sa zone, assombrie de « bubble_darken » :
## le contraste reste le même partout (choix retenu pour le thème clair, où l'Humus du GDD
## se confondait avec le fond du centre).
@export var bubble_from_zone: bool = false
## Assombrissement de la bulle par rapport au fond de sa zone (0 à 1).
@export_range(0.0, 1.0) var bubble_darken: float = 0.12
## Fond de la zone 1 (bord de la forêt).
@export var zone_edge: Color = Color("#F6EEE2")
## Fond de la dernière zone (centre de la forêt).
@export var zone_center: Color = Color("#E0C7AE")
## Trait qui entoure chaque zone.
@export var zone_line: Color = Color("#2B2430")


## Fond d'une zone : les teintes sont réparties régulièrement entre le bord et le centre.
func zone_color(zone: int, zone_count: int) -> Color:
	if zone_count <= 1:
		return zone_center
	return zone_edge.lerp(zone_center, float(zone - 1) / float(zone_count - 1))


## Couleur de la bulle d'une case selon sa zone.
func bubble_color(zone: int, zone_count: int) -> Color:
	if bubble_from_zone:
		return zone_color(zone, zone_count).darkened(bubble_darken)
	return humus


## Fond d'un bouton survolé.
func card_hover() -> Color:
	return card.lerp(line, 0.5)


## Fond d'un bouton enfoncé.
func card_pressed() -> Color:
	return line
