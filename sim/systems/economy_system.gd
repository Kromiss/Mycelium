class_name EconomySystem
extends RefCounted
## Étape 6 du tick : production de chaque colonie (GDD §8.2, §15). Toutes les cases de la
## colonie produisent (elles restent reliées à la Tourelle : les cases coupées redeviennent
## libres), Tourelle comprise ; le stock n'a pas de plafond ; la Biomasse compte tout.


func run(state: GameState, result: TickResult) -> void:
	var productions: PackedInt64Array = ColonyStats.all_productions(state)
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var produced: int = productions[colony.id]
		colony.production = produced
		colony.peak_production = maxi(colony.peak_production, produced)
		colony.nutrients += produced
		colony.biomass += produced
		if produced > 0:
			result.colony_changed(colony.id)
