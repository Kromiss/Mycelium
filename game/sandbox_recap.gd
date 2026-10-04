class_name SandboxRecap
extends RefCounted
## Récapitulatif d'une partie de Bac à sable (GDD §2.1 bis) : un texte lisible, dans la langue
## du joueur, avec les réglages de la partie et ses résultats, à copier pour le transmettre.


## Texte complet du récapitulatif.
static func build(config: SandboxConfig, state: GameState, colony: ColonyState) -> String:
	var defs: SimDefs = config.defs
	var lines := PackedStringArray()
	var version: String = ProjectSettings.get_setting("application/config/version", "")
	lines.append(tr_key("RECAP_HEADER") % [tr_key("GAME_TITLE"), version])
	lines.append("")
	lines.append(tr_key("RECAP_SETTINGS"))
	lines.append(
		(
			"- "
			+ (
				tr_key("RECAP_FOREST")
				% [tr_key(config.mode.name_key), defs.radius(), config.game_seed]
			)
		)
	)
	(
		lines
		. append(
			(
				"- "
				+ (
					tr_key("RECAP_ECONOMY")
					% [
						_decimal(defs.unit_cost),
						_decimal(defs.cell_yield),
						defs.base_growth_ticks,
						defs.start_stock_units,
					]
				)
			)
		)
	)
	(
		lines
		. append(
			(
				"- "
				+ (
					tr_key("RECAP_EXPANSION")
					% [
						NumberFormat.multiplier(defs.colonize_cost_growth_pm),
						_percent(defs.cohesion_per_neighbor_pm),
						defs.max_growths,
						defs.expansion_queue_size,
					]
				)
			)
		)
	)
	lines.append("- " + tr_key("RECAP_ZONES") % _zones_text(defs))
	lines.append("- " + tr_key("RECAP_TIERS") % _tiers_text(defs))
	lines.append("- " + _construction_text(defs))
	for building: SimBuilding in defs.buildings:
		lines.append("- " + _building_text(building))
	lines.append("")
	lines.append(tr_key("RECAP_RESULTS") % NumberFormat.clock(state.tick))
	(
		lines
		. append(
			(
				"- "
				+ (
					tr_key("RECAP_CELLS")
					% [
						colony.cell_count,
						colony.tier,
						NumberFormat.multiplier(TierSystem.production_pm(defs, colony.tier)),
					]
				)
			)
		)
	)
	(
		lines
		. append(
			(
				"- "
				+ (
					tr_key("RECAP_PRODUCTION")
					% [
						NumberFormat.rate(colony.production),
						NumberFormat.rate(colony.peak_production),
						NumberFormat.amount(colony.biomass),
						NumberFormat.amount(colony.nutrients),
					]
				)
			)
		)
	)
	(
		lines
		. append(
			(
				"- "
				+ (
					tr_key("RECAP_ENZYMES")
					% [
						NumberFormat.amount(colony.enzymes),
						NumberFormat.amount(colony.enzyme_production * 60),
						NumberFormat.amount(colony.stock_cap),
					]
				)
			)
		)
	)
	lines.append("- " + tr_key("RECAP_BUILDINGS_BUILT") % _built_text(state, colony))
	lines.append("- " + tr_key("RECAP_TIER_TIMES") % _times_text(colony.tier_ticks, false))
	lines.append("- " + tr_key("RECAP_ZONE_TIMES") % _times_text(colony.zone_ticks, true))
	return "\n".join(lines)


## Traduction d'une clé (le récapitulatif est construit hors de l'arbre de scène).
static func tr_key(key: String) -> String:
	return TranslationServer.translate(key)


static func _zones_text(defs: SimDefs) -> String:
	var parts := PackedStringArray()
	for zone: int in range(defs.zone_count()):
		(
			parts
			. append(
				(
					"%d %s / %s / %s"
					% [
						zone + 1,
						NumberFormat.multiplier(defs.zone_richness_pm[zone]),
						NumberFormat.multiplier(defs.zone_cost_pm[zone]),
						NumberFormat.multiplier(defs.zone_growth_pm[zone]),
					]
				)
			)
		)
	return " ; ".join(parts)


static func _tiers_text(defs: SimDefs) -> String:
	var parts := PackedStringArray()
	for tier: int in range(defs.tier_cells.size()):
		parts.append(
			(
				"%d → %s"
				% [defs.tier_cells[tier], NumberFormat.multiplier(defs.tier_production_pm[tier])]
			)
		)
	return " ; ".join(parts)


## Réglages généraux des bâtiments.
static func _construction_text(defs: SimDefs) -> String:
	var times := PackedStringArray()
	for ticks: int in defs.build_ticks_by_tier:
		times.append(str(ticks))
	return (
		tr_key("RECAP_CONSTRUCTION")
		% [
			defs.building_slots_base,
			defs.building_slots_per_tier,
			defs.stock_cap_seconds,
			defs.max_growths_cap,
			defs.base_build_sites,
			defs.max_build_sites,
			defs.build_queue_size,
			_percent(defs.demolish_refund_pm),
			" / ".join(times),
		]
	)


## Réglages d'un bâtiment : coût, palier, limite et effets.
static func _building_text(building: SimBuilding) -> String:
	var parts := PackedStringArray(
		[tr_key("RECAP_BUILDING_COST") % [building.cost_seconds, building.cost_units]]
	)
	if building.cost_enzymes > 0:
		parts.append(tr_key("BUILDING_COST_ENZYMES") % building.cost_enzymes)
	parts.append(tr_key("RECAP_BUILDING_TIER") % building.unlock_tier)
	if building.max_count > 0:
		parts.append(tr_key("RECAP_BUILDING_MAX") % building.max_count)
	parts.append_array(BuildingText.effects(building))
	return tr_key("RECAP_BUILDING") % [tr_key(building.name_key), ", ".join(parts)]


## Bâtiments construits par type (et combien sont désactivés).
static func _built_text(state: GameState, colony: ColonyState) -> String:
	var parts := PackedStringArray()
	for type: int in range(state.defs.buildings.size()):
		var built: int = 0
		var off: int = 0
		for cell: int in range(state.cell_count()):
			if state.building[cell] != type or state.owner[cell] != colony.id:
				continue
			if state.building_state[cell] != GameState.BuildState.BUILT:
				continue
			built += 1
			if state.building_active[cell] == 0:
				off += 1
		if built == 0:
			continue
		var text: String = "%s ×%d" % [tr_key(state.defs.buildings[type].name_key), built]
		if off > 0:
			text += " " + tr_key("RECAP_BUILDINGS_OFF") % off
		parts.append(text)
	if parts.is_empty():
		return tr_key("RECAP_NONE")
	return ", ".join(parts)


## « 1 à 00:42, 2 à 01:30 » ; « skip_start » ignore les entrées atteintes dès le départ.
static func _times_text(ticks: PackedInt32Array, skip_start: bool) -> String:
	var parts := PackedStringArray()
	for index: int in range(ticks.size()):
		var tick: int = ticks[index]
		if tick < 0 or (skip_start and tick == 0):
			continue
		parts.append(tr_key("RECAP_AT") % [index + 1, NumberFormat.clock(tick)])
	if parts.is_empty():
		return tr_key("RECAP_NONE")
	return ", ".join(parts)


## Millièmes écrits avec trois décimales au plus (« 3,333 », « 30 »).
static func _decimal(milli: int) -> String:
	return NumberFormat.decimal(milli)


## Pour-mille écrits en pour-cent (« 5 »).
static func _percent(per_mille: int) -> String:
	return NumberFormat.decimal(per_mille * 100)
