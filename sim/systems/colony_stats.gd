class_name ColonyStats
extends RefCounted
## Chiffres d'une colonie qui découlent de ses améliorations, de ses mutations et des données
## (GDD §5 à §10, §15) : dégâts, cadence, portée, PV, soin, production, coûts. Partagés par les
## systèmes, les requêtes de l'interface et, plus tard, les robots : les règles restent ici.


## Bonus cumulé des améliorations d'une statistique (UpgradeDef.Stat) : niveau × effet.
static func upgrade_bonus(defs: SimDefs, colony: ColonyState, stat: int) -> int:
	var total: int = 0
	for index: int in range(defs.upgrades.size()):
		if defs.upgrades[index].stat == stat:
			total += colony.upgrade_levels[index] * defs.upgrades[index].effect
	return total


## Produit (en pour-mille) d'un multiplicateur des mutations prises (champ de SimMutation).
static func mutation_product(defs: SimDefs, colony: ColonyState, field: StringName) -> int:
	var total: int = Fixed.ONE
	for index: int in colony.mutations:
		var value: int = defs.mutations[index].get(field)
		total = Fixed.mul(total, value)
	return total


## Somme d'un ajout des mutations prises (champ de SimMutation).
static func mutation_sum(defs: SimDefs, colony: ColonyState, field: StringName) -> int:
	var total: int = 0
	for index: int in colony.mutations:
		var value: int = defs.mutations[index].get(field)
		total += value
	return total


# --- Tourelle ---


## Dégâts d'une spore, en millièmes, avant critique et sans tenir compte de la case touchée.
static func damage(defs: SimDefs, colony: ColonyState) -> int:
	var base: int = Fixed.mul(
		defs.turret_damage, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.DAMAGE)
	)
	return Fixed.mul(base, mutation_product(defs, colony, &"damage_pm"))


## Dégâts d'une spore sur une case donnée (Pionnier, Prédateur), avant critique.
static func damage_on(state: GameState, colony: ColonyState, cell: int) -> int:
	var amount: int = damage(state.defs, colony)
	if state.owner[cell] < 0:
		return Fixed.mul(amount, mutation_product(state.defs, colony, &"free_damage_pm"))
	return Fixed.mul(amount, mutation_product(state.defs, colony, &"enemy_damage_pm"))


## Tirs par seconde, en pour-mille, Salve comprise si elle est active à ce tick.
static func rate_pm(state: GameState, colony: ColonyState) -> int:
	var defs: SimDefs = state.defs
	var rate: int = Fixed.mul(
		defs.turret_rate_pm, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.RATE)
	)
	rate = Fixed.mul(rate, mutation_product(defs, colony, &"rate_pm"))
	if state.tick < colony.salvo_until:
		rate = Fixed.mul(rate, colony.salvo_rate_pm)
	return rate


## Portée de la Tourelle, en cases.
static func turret_range(defs: SimDefs, colony: ColonyState) -> int:
	return (
		defs.turret_range
		+ upgrade_bonus(defs, colony, UpgradeDef.Stat.RANGE)
		+ mutation_sum(defs, colony, &"range_add")
	)


## Spores par tir (une cible différente chacune).
static func spores(defs: SimDefs, colony: ColonyState) -> int:
	return (
		defs.turret_spores
		+ upgrade_bonus(defs, colony, UpgradeDef.Stat.SPORES)
		+ mutation_sum(defs, colony, &"spores_add")
	)


## Part des dégâts infligée aux voisines de la case touchée (Éclaboussure), en pour-mille.
static func splash_pm(defs: SimDefs, colony: ColonyState) -> int:
	return upgrade_bonus(defs, colony, UpgradeDef.Stat.SPLASH)


## Chance de coup critique, en pour-mille (1000 au plus).
static func crit_pm(defs: SimDefs, colony: ColonyState) -> int:
	return mini(upgrade_bonus(defs, colony, UpgradeDef.Stat.CRIT), Fixed.ONE)


## Nombre de cases voisines touchées par le reste des dégâts quand une spore prend une case.
static func bounce(defs: SimDefs, colony: ColonyState) -> int:
	return upgrade_bonus(defs, colony, UpgradeDef.Stat.BOUNCE)


## Soin d'une spore sur une de mes cases, en millièmes.
static func heal(defs: SimDefs, colony: ColonyState) -> int:
	var amount: int = Fixed.mul(damage(defs, colony), defs.heal_pm)
	amount = Fixed.mul(amount, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.HEAL))
	return Fixed.mul(amount, mutation_product(defs, colony, &"heal_pm"))


## Secondes de blocage de la régénération des cases touchées (Toxique ; 0 : aucun).
static func toxic_ticks(defs: SimDefs, colony: ColonyState) -> int:
	var ticks: int = 0
	for index: int in colony.mutations:
		ticks = maxi(ticks, defs.mutations[index].toxic_ticks)
	return ticks


## PV max de la Tourelle, en millièmes (10 × PV de base d'une case, Écorce, Blindé).
static func turret_max_hp(defs: SimDefs, colony: ColonyState) -> int:
	var hp: int = defs.cell_hp * defs.turret_hp_cells
	hp = Fixed.mul(hp, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.TURRET_HP))
	return Fixed.mul(hp, mutation_product(defs, colony, &"turret_hp_pm"))


## Valeur actuelle d'une statistique d'amélioration (UpgradeDef.Stat), pour l'affichage :
## dégâts (millièmes), tirs par seconde (pour-mille, sans Salve), portée (cases), production
## (millièmes par seconde), régénération (pour-mille des PV max par seconde), soin (millièmes),
## spores, multiplicateur des PV des cases (pour-mille), Éclaboussure et critique (pour-mille),
## PV de la Tourelle (millièmes), Rebond (cases).
static func stat_value(state: GameState, colony: ColonyState, stat: int) -> int:
	var defs: SimDefs = state.defs
	match stat:
		UpgradeDef.Stat.DAMAGE:
			return damage(defs, colony)
		UpgradeDef.Stat.RATE:
			var rate: int = Fixed.mul(
				defs.turret_rate_pm, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.RATE)
			)
			return Fixed.mul(rate, mutation_product(defs, colony, &"rate_pm"))
		UpgradeDef.Stat.RANGE:
			return turret_range(defs, colony)
		UpgradeDef.Stat.YIELD:
			return colony_production(state, colony)
		UpgradeDef.Stat.REGEN:
			return regen_pm(defs, colony)
		UpgradeDef.Stat.HEAL:
			return heal(defs, colony)
		UpgradeDef.Stat.SPORES:
			return spores(defs, colony)
		UpgradeDef.Stat.CELL_HP:
			return cell_hp_factor(defs, colony)
		UpgradeDef.Stat.SPLASH:
			return splash_pm(defs, colony)
		UpgradeDef.Stat.CRIT:
			return crit_pm(defs, colony)
		UpgradeDef.Stat.TURRET_HP:
			return turret_max_hp(defs, colony)
		UpgradeDef.Stat.BOUNCE:
			return bounce(defs, colony)
	return 0


# --- Cases ---


## Régénération des cases et de la Tourelle de la colonie, en pour-mille des PV max par seconde.
static func regen_pm(defs: SimDefs, colony: ColonyState) -> int:
	var rate: int = defs.regen_pm + upgrade_bonus(defs, colony, UpgradeDef.Stat.REGEN)
	return Fixed.mul(rate, mutation_product(defs, colony, &"regen_pm"))


## Multiplicateur des PV de toutes les cases de la colonie (amélioration PV des cases).
static func cell_hp_factor(defs: SimDefs, colony: ColonyState) -> int:
	return Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.CELL_HP)


## PV max d'une case libre, en millièmes.
static func free_max_hp(state: GameState, cell: int) -> int:
	return Fixed.mul(state.defs.cell_hp, state.defs.zone_free_hp_pm[state.map.zones[cell] - 1])


## PV max d'une case : libre (zone) ou possédée (zone, Cohésion, améliorations, mutations).
## « factor » et « cohesion » : valeurs de la colonie déjà calculées (−1 : les calculer).
static func cell_max_hp(state: GameState, cell: int, factor: int = -1, cohesion: int = -1) -> int:
	var holder: ColonyState = state.owner_of(cell)
	if holder == null:
		return free_max_hp(state, cell)
	var defs: SimDefs = state.defs
	if factor < 0:
		factor = cell_hp_factor(defs, holder)
	if cohesion < 0:
		cohesion = Fixed.mul(defs.cohesion_hp_pm, mutation_product(defs, holder, &"cohesion_pm"))
	var hp: int = Fixed.mul(defs.cell_hp, defs.zone_defense_pm[state.map.zones[cell] - 1])
	hp = Fixed.mul(hp, Fixed.ONE + cohesion * state.owned_neighbors(cell, holder.id))
	return Fixed.mul(hp, factor)


# --- Économie ---


## Production d'une case pour sa colonie, en millièmes par seconde, avant les multiplicateurs
## de la colonie : rendement × richesse × Cohésion (plafonnée) × Racines profondes.
## « cohesion_mod » et « deep_mod » : mutations de la colonie déjà calculées (−1 : les calculer).
static func cell_production(
	state: GameState, colony: ColonyState, cell: int, cohesion_mod: int = -1, deep_mod: int = -1
) -> int:
	var defs: SimDefs = state.defs
	if cohesion_mod < 0:
		cohesion_mod = mutation_product(defs, colony, &"cohesion_pm")
	var zone: int = state.map.zones[cell]
	var base: int = Fixed.mul(defs.cell_yield, defs.zone_richness_pm[zone - 1])
	var per_neighbor: int = Fixed.mul(defs.cohesion_production_pm, cohesion_mod)
	var cap: int = Fixed.mul(defs.cohesion_production_cap_pm, cohesion_mod)
	var bonus: int = mini(per_neighbor * state.owned_neighbors(cell, colony.id), cap)
	base = Fixed.mul(base, Fixed.ONE + bonus)
	if zone >= defs.deep_zone:
		if deep_mod < 0:
			deep_mod = mutation_product(defs, colony, &"deep_production_pm")
		base = Fixed.mul(base, deep_mod)
	return base


## Multiplicateur de production de la colonie, en pour-mille : palier, Armillaire, Rendement
## et Trophées (GDD §8.2, §12, §15).
static func production_factor(state: GameState, colony: ColonyState) -> int:
	var defs: SimDefs = state.defs
	var factor: int = tier_production_pm(defs, colony.tier)
	factor = Fixed.mul(factor, strain_pm(state))
	factor = Fixed.mul(factor, Fixed.ONE + upgrade_bonus(defs, colony, UpgradeDef.Stat.YIELD))
	return Fixed.mul(factor, Fixed.ONE + colony.trophies * defs.trophy_production_pm)


## Production de chaque colonie (rang = numéro de colonie), en millièmes par seconde : même
## résultat que colony_production() pour chacune, en un seul passage sur les cases.
static func all_productions(state: GameState) -> PackedInt64Array:
	var defs: SimDefs = state.defs
	var count: int = state.colonies.size()
	var cohesion_mods := PackedInt64Array()
	var deep_mods := PackedInt64Array()
	var totals := PackedInt64Array()
	totals.resize(count)
	for colony: ColonyState in state.colonies:
		cohesion_mods.append(mutation_product(defs, colony, &"cohesion_pm"))
		deep_mods.append(mutation_product(defs, colony, &"deep_production_pm"))
	var owners: PackedInt32Array = state.owner
	for cell: int in range(state.cell_count()):
		var owner: int = owners[cell]
		if owner < 0:
			continue
		var colony: ColonyState = state.colonies[owner]
		if colony.alive:
			totals[owner] += cell_production(
				state, colony, cell, cohesion_mods[owner], deep_mods[owner]
			)
	for colony: ColonyState in state.colonies:
		totals[colony.id] = (
			Fixed.mul(totals[colony.id], production_factor(state, colony)) if colony.alive else 0
		)
	return totals


## Production totale de la colonie, en millièmes par seconde.
static func colony_production(state: GameState, colony: ColonyState) -> int:
	if not colony.alive:
		return 0
	var cohesion_mod: int = mutation_product(state.defs, colony, &"cohesion_pm")
	var deep_mod: int = mutation_product(state.defs, colony, &"deep_production_pm")
	var total: int = 0
	for cell: int in range(state.cell_count()):
		if state.owner[cell] == colony.id:
			total += cell_production(state, colony, cell, cohesion_mod, deep_mod)
	return Fixed.mul(total, production_factor(state, colony))


## Bonus de l'Armillaire à ce tick, en pour-mille : de ×1,00 à ×1,25 sur la durée maximale.
static func strain_pm(state: GameState) -> int:
	var defs: SimDefs = state.defs
	var elapsed: int = mini(state.tick, defs.match_ticks)
	return Fixed.ONE + Fixed.div_round(defs.strain_bonus_pm * elapsed, maxi(1, defs.match_ticks))


## Multiplicateur de production d'un palier, en pour-mille (×1 au départ).
static func tier_production_pm(defs: SimDefs, tier: int) -> int:
	if tier <= 0:
		return Fixed.ONE
	return defs.tier_production_pm[mini(tier, defs.tier_count()) - 1]


## Palier atteint avec ce nombre de cases : nombre de seuils franchis.
static func tier_for(defs: SimDefs, cells: int) -> int:
	var tier: int = 0
	for threshold: int in defs.tier_cells:
		if cells >= threshold:
			tier += 1
	return tier


## Lot d'Enzymes d'un palier (1 à 6) pour la colonie, en millièmes (Glande comprise).
static func tier_enzymes(defs: SimDefs, colony: ColonyState, tier: int) -> int:
	var lot: int = Fixed.from_units(defs.tier_enzymes[tier - 1])
	return Fixed.mul(lot, mutation_product(defs, colony, &"enzymes_pm"))


## Coût du prochain niveau d'une amélioration, en millièmes (−1 : niveau maximal atteint).
static func upgrade_cost(defs: SimDefs, colony: ColonyState, index: int) -> int:
	return upgrade_cost_at(defs, colony, index, colony.upgrade_levels[index])


## Coût du niveau « level » + 1 d'une amélioration, en millièmes (−1 : au-delà du maximum).
static func upgrade_cost_at(defs: SimDefs, colony: ColonyState, index: int, level: int) -> int:
	var upgrade: SimUpgrade = defs.upgrades[index]
	var table: PackedInt64Array = defs.upgrade_cost_tables[index]
	if (upgrade.max_level > 0 and level >= upgrade.max_level) or level >= table.size():
		return -1
	var base: int = upgrade.base_cost_units * defs.unit_cost
	var cost: int = Fixed.mul(base, table[level])
	return Fixed.mul(cost, mutation_product(defs, colony, &"cost_pm"))
