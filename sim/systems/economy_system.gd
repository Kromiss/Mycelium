class_name EconomySystem
extends RefCounted
## Étape 6 du tick : production de chaque colonie (GDD §8.2, §15). Toutes les cases de la
## colonie produisent (elles restent reliées à la Tourelle : les cases coupées redeviennent
## libres), Tourelle comprise ; le stock n'a pas de plafond ; la Biomasse compte tout. Revenu
## lent d'Enzymes (décidé le 6 octobre 2026) : un lot toutes les N secondes de jeu.


func run(state: GameState, result: TickResult) -> void:
	var productions: PackedInt64Array = ColonyStats.all_productions(state)
	var defs: SimDefs = state.defs
	var income: bool = (
		defs.enzyme_income_ticks > 0 and (state.tick + 1) % defs.enzyme_income_ticks == 0
	)
	for colony: ColonyState in state.colonies:
		if not colony.alive:
			continue
		var produced: int = productions[colony.id]
		colony.production = produced
		colony.peak_production = maxi(colony.peak_production, produced)
		colony.nutrients += produced
		colony.biomass += produced
		if income:
			colony.enzymes += Fixed.from_units(defs.enzyme_income)
		if produced > 0 or income:
			result.colony_changed(colony.id)
