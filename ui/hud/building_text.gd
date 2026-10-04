class_name BuildingText
extends RefCounted
## Textes des bâtiments pour le HUD (nom, état, effet), déjà traduits. Les chiffres viennent
## des définitions de la partie et de la simulation : aucune règle ici.


## Nom traduit d'un bâtiment.
static func name_of(building: SimBuilding) -> String:
	return _t(building.name_key)


## Lignes à montrer pour le bâtiment d'une case : nom, état, effet.
static func lines(session: Session, cell: int) -> PackedStringArray:
	var state: GameState = session.simulation.state
	var result := PackedStringArray()
	var type: int = state.building[cell]
	if type < 0:
		return result
	var building: SimBuilding = state.defs.buildings[type]
	result.append(name_of(building))
	result.append(state_line(session, cell))
	if state.building_active[cell] == 1:
		result.append_array(current_effects(session, cell))
	else:
		result.append_array(effects(building))
	return result


## État du bâtiment d'une case : en file (n° N), chantier (encore X s), actif ou désactivé.
static func state_line(session: Session, cell: int) -> String:
	var state: GameState = session.simulation.state
	var colony: ColonyState = session.colony()
	var building: SimBuilding = state.defs.buildings[state.building[cell]]
	match state.building_state[cell]:
		GameState.BuildState.QUEUED:
			return _t("BUILDING_STATE_QUEUED") % (colony.build_queue.find(cell) + 1)
		GameState.BuildState.CONSTRUCTING:
			return _t("BUILDING_STATE_CONSTRUCTING") % state.build_left[cell]
	if state.building_active[cell] == 1:
		return _t("BUILDING_STATE_ACTIVE")
	return locked_line(state.defs, building.unlock_tier)


## « Palier N requis (X cases) ».
static func locked_line(defs: SimDefs, tier: int) -> String:
	var cells: int = defs.tier_cells[tier - 1] if tier > 0 and tier <= defs.tier_cells.size() else 0
	return _t("BUILDING_STATE_LOCKED") % [tier, cells]


## Effets d'un type de bâtiment, d'après ses chiffres (palette, menu rond, bâtiment inactif).
static func effects(building: SimBuilding) -> PackedStringArray:
	var result := PackedStringArray()
	if building.yield_bonus_pm != 0:
		result.append(
			(
				_t("BUILDING_EFFECT_YIELD")
				% [_percent(building.yield_bonus_pm), building.effect_radius]
			)
		)
	if building.enzymes_per_cell_minute != 0:
		result.append(
			(
				_t("BUILDING_EFFECT_ENZYMES_ZONE")
				% [building.enzymes_per_cell_minute, building.effect_radius]
			)
		)
	if building.stock_minutes != 0:
		result.append(_t("BUILDING_EFFECT_STOCK") % building.stock_minutes)
	if building.growth_reduction_pm != 0:
		result.append(
			(
				_t("BUILDING_EFFECT_GROWTH")
				% [_percent(building.growth_reduction_pm), building.effect_radius]
			)
		)
	if building.extra_sites != 0:
		result.append(_t("BUILDING_EFFECT_SITES") % building.extra_sites)
	if building.extra_growths != 0:
		result.append(_t("BUILDING_EFFECT_GROWTHS") % building.extra_growths)
	return result


## Effets actuels d'un bâtiment actif : effet de zone et nombre de cases de la colonie qu'il
## couvre ; les autres effets sont ceux du type.
static func current_effects(session: Session, cell: int) -> PackedStringArray:
	var state: GameState = session.simulation.state
	var building: SimBuilding = state.defs.buildings[state.building[cell]]
	var colony_id: int = session.local_colony
	var result := PackedStringArray()
	if building.yield_bonus_pm != 0 or building.enzymes_per_cell_minute != 0:
		var single := SimBuilding.new()
		single.yield_bonus_pm = building.yield_bonus_pm
		single.enzymes_per_cell_minute = building.enzymes_per_cell_minute
		single.effect_radius = building.effect_radius
		result.append_array(effects(single))
		var covered: int = Buildings.covered_cells(state, colony_id, cell)
		result.append(_t("BUILDING_EFFECT_COVERED") % covered)
	if building.stock_minutes != 0:
		result.append(_t("BUILDING_EFFECT_STOCK") % building.stock_minutes)
	if building.growth_reduction_pm != 0:
		result.append(
			(
				_t("BUILDING_EFFECT_GROWTH")
				% [_percent(building.growth_reduction_pm), building.effect_radius]
			)
		)
	if building.extra_sites != 0:
		result.append(_t("BUILDING_EFFECT_SITES") % building.extra_sites)
	if building.extra_growths != 0:
		result.append(_t("BUILDING_EFFECT_GROWTHS") % building.extra_growths)
	return result


## Coût d'un bâtiment (nutriments, et Enzymes s'il en demande).
static func cost_text(session: Session, building: SimBuilding) -> String:
	var cost: int = session.simulation.building_cost(session.local_colony, building.id)
	var text: String = NumberFormat.amount(cost)
	if building.cost_enzymes > 0:
		text += " + " + _t("BUILDING_COST_ENZYMES") % building.cost_enzymes
	return text


## Pour-mille en pourcentage (« 30 »).
static func _percent(per_mille: int) -> String:
	return NumberFormat.decimal(per_mille * 100)


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
