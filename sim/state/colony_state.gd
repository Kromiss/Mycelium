class_name ColonyState
extends RefCounted
## État d'une colonie : ressources, Tourelle, palier, améliorations, mutations, capacités et
## statistiques. Les quantités sont en millièmes.

## Priorité de tir de la Tourelle (GDD §5.3).
enum Priority { CLOSEST, RICHEST, HEAL_FIRST, ENEMIES_FIRST }

## Numéro de la colonie (son rang dans GameState.colonies).
var id: int = 0
## Secteur de la forêt où la colonie a démarré.
var sector: int = 0
## Vrai tant que la colonie n'est pas éliminée.
var alive: bool = true

# --- Ressources ---
## Stock de nutriments (sans plafond).
var nutrients: int = 0
## Biomasse : total des nutriments produits depuis le début (GDD §8.1).
var biomass: int = 0
## Enzymes, en millièmes.
var enzymes: int = 0
## Production du dernier tick (nutriments par seconde).
var production: int = 0
## Plus forte production atteinte.
var peak_production: int = 0
## Nombre de cases, Tourelle comprise.
var cell_count: int = 0
## Palier de colonie atteint (0 = départ).
var tier: int = 0
## Tick où chaque palier a été atteint pour la première fois (index 0 = palier 1 ; −1 jamais).
var tier_ticks: PackedInt32Array = PackedInt32Array()
## Tick où une case de chaque zone a été prise pour la première fois
## (index 0 = zone 1 ; −1 jamais ; 0 pour la zone de départ).
var zone_ticks: PackedInt32Array = PackedInt32Array()

# --- Tourelle (GDD §5) ---
## Case de la Tourelle (−1 une fois la colonie éliminée).
var turret: int = -1
## PV de la Tourelle, en millièmes.
var turret_hp: int = 0
## Priorité de tir (Priority).
var priority: int = Priority.CLOSEST
## Cible désignée au clic (−1 : aucune). Elle passe avant les cibles de la priorité.
var designated: int = -1
## Cibles gardées, une par spore, dans l'ordre (la cible désignée n'y figure pas).
var targets: PackedInt32Array = PackedInt32Array()
## Tirs accumulés, en millièmes de tir (la cadence n'est pas un nombre entier de tirs par tick).
var shot_progress: int = 0
## Case vers laquelle la Tourelle fait un pas (−1 : aucun pas), et secondes restantes.
var move_to: int = -1
var move_left: int = 0

# --- Améliorations, mutations, capacités ---
## Niveau de chaque amélioration (rang dans SimDefs.upgrades).
var upgrade_levels: PackedInt32Array = PackedInt32Array()
## Mutations prises, dans l'ordre (rangs dans SimDefs.mutations), et palier de chacune.
var mutations: PackedInt32Array = PackedInt32Array()
var mutation_tiers: PackedInt32Array = PackedInt32Array()
## Choix de mutations en attente, à la suite (blocs de SimDefs.mutation_choices rangs,
## complétés par −1 s'il reste moins de mutations que de choix). Le premier bloc est affiché.
var pending_offers: PackedInt32Array = PackedInt32Array()
## Palier qui a donné chaque choix en attente (un par bloc).
var pending_tiers: PackedInt32Array = PackedInt32Array()
## Tick à partir duquel chaque capacité peut à nouveau être lancée.
var ability_ready: PackedInt32Array = PackedInt32Array()
## Salve : tick jusqu'auquel (exclu) la cadence est multipliée, et le multiplicateur.
var salvo_until: int = 0
var salvo_rate_pm: int = 1000
## Mur de mycélium : case au centre, rayon et tick jusqu'auquel (exclu) il protège.
var wall_center: int = -1
var wall_radius: int = 0
var wall_until: int = 0

# --- Conflit et statistiques ---
## Trophées gagnés (Tourelles abattues, GDD §12).
var trophies: int = 0
## Tick de l'élimination (−1 : en vie) et colonie qui a abattu la Tourelle (−1 : aucune).
var eliminated_tick: int = -1
var killer: int = -1
## Cases prises (libres et adverses) depuis le début.
var cells_captured: int = 0


## Rang de chaque mutation prise, pour savoir si une mutation l'est déjà.
func has_mutation(index: int) -> bool:
	return mutations.has(index)


## Nombre de choix de mutations en attente.
func pending_choice_count(choices: int) -> int:
	@warning_ignore("integer_division")
	return pending_offers.size() / maxi(1, choices)


## Copie de ce dont dépendent les chiffres de la colonie (ColonyStats) : améliorations,
## mutations, palier, Trophées, Salve. Sert à prévoir l'effet d'un achat sans toucher à l'état.
func stats_copy() -> ColonyState:
	var copy := ColonyState.new()
	copy.id = id
	copy.alive = alive
	copy.tier = tier
	copy.trophies = trophies
	copy.turret = turret
	copy.salvo_until = salvo_until
	copy.salvo_rate_pm = salvo_rate_pm
	copy.upgrade_levels = upgrade_levels.duplicate()
	copy.mutations = mutations.duplicate()
	return copy


## Vrai si la Tourelle est en train de faire un pas.
func is_moving() -> bool:
	return move_to >= 0


## Valeurs entières de la colonie, dans un ordre fixe, pour l'empreinte de la partie.
func hash_values() -> PackedInt64Array:
	var values := PackedInt64Array(
		[
			id,
			sector,
			1 if alive else 0,
			nutrients,
			biomass,
			enzymes,
			production,
			peak_production,
			cell_count,
			tier,
			turret,
			turret_hp,
			priority,
			designated,
			shot_progress,
			move_to,
			move_left,
			salvo_until,
			salvo_rate_pm,
			wall_center,
			wall_radius,
			wall_until,
			trophies,
			eliminated_tick,
			killer,
			cells_captured,
		]
	)
	for array: PackedInt32Array in [
		tier_ticks,
		zone_ticks,
		targets,
		upgrade_levels,
		mutations,
		mutation_tiers,
		pending_offers,
		pending_tiers,
		ability_ready,
	]:
		values.append(array.size())
		for value: int in array:
			values.append(value)
	return values
