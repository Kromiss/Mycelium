class_name SandboxRecap
extends RefCounted
## Récapitulatif d'une partie de Bac à sable (GDD §2.1 bis) : un texte lisible, dans la langue
## du joueur, avec tous les réglages chiffrés de la partie et ses résultats, à copier pour le
## transmettre.


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
	lines.append("- " + tr_key("RECAP_OPPONENTS") % _opponents_text(config))
	lines.append_array(_settings_lines(defs))
	lines.append("")
	lines.append(tr_key("RECAP_RESULTS") % NumberFormat.clock(state.tick))
	lines.append_array(_result_lines(state, colony))
	lines.append_array(_opponent_lines(config, state, colony))
	return "\n".join(lines)


## Profil de chaque secteur libre (« Secteur 2 : Canonnier, Secteur 3 : Aucun »).
static func _opponents_text(config: SandboxConfig) -> String:
	var parts := PackedStringArray()
	for index: int in range(config.opponent_count()):
		var sector: String = tr_key("SANDBOX_SECTOR") % (index + 2)
		parts.append(tr_key("RECAP_PAIR") % [sector, RobotCatalog.label(config.opponent(index))])
	return tr_key("RECAP_NONE") if parts.is_empty() else ", ".join(parts)


## Une ligne par robot : couleur, profil, cases, palier, en vie ou éliminé.
static func _opponent_lines(
	config: SandboxConfig, state: GameState, colony: ColonyState
) -> PackedStringArray:
	var lines := PackedStringArray()
	var profiles: Array[StringName] = config.colony_profiles()
	for other: ColonyState in state.colonies:
		if other.id == colony.id:
			continue
		var profile: StringName = profiles[other.id] if other.id < profiles.size() else &""
		var status: String = tr_key("RECAP_ALIVE")
		if not other.alive:
			status = tr_key("RECAP_ELIMINATED") % NumberFormat.clock(other.eliminated_tick)
		var name: String = GameText.colony_name(other.id, colony.id)
		var values: Array = [
			name, RobotCatalog.label(profile), other.cell_count, other.tier, status
		]
		lines.append("- " + tr_key("RECAP_OPPONENT") % values)
	return lines


## Traduction d'une clé (le récapitulatif est construit hors de l'arbre de scène).
static func tr_key(key: String) -> String:
	return TranslationServer.translate(key)


## Une ligne pour les réglages généraux, puis une par zone, palier, amélioration et capacité.
static func _settings_lines(defs: SimDefs) -> PackedStringArray:
	var lines := PackedStringArray()
	var general := PackedStringArray()
	var row := PackedStringArray()
	var row_name: String = ""
	for param: SandboxParam in SandboxParam.all(defs):
		var text: String = tr_key("RECAP_PAIR") % [tr_key(param.label_key), _value(param, defs)]
		if param.group == SandboxParam.Group.GENERAL:
			general.append(text)
			continue
		var name: String = param.row_name(defs)
		if name != row_name and not row.is_empty():
			lines.append("- %s — %s" % [row_name, ", ".join(row)])
			row = PackedStringArray()
		row_name = name
		row.append(text)
	if not row.is_empty():
		lines.append("- %s — %s" % [row_name, ", ".join(row)])
	lines.insert(0, "- " + " · ".join(general))
	return lines


static func _result_lines(state: GameState, colony: ColonyState) -> PackedStringArray:
	var defs: SimDefs = state.defs
	var lines := PackedStringArray()
	var multiplier: String = NumberFormat.multiplier(
		ColonyStats.tier_production_pm(defs, colony.tier)
	)
	lines.append("- " + tr_key("RECAP_CELLS") % [colony.cell_count, colony.tier, multiplier])
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
					tr_key("RECAP_COMBAT")
					% [
						NumberFormat.amount(colony.enzymes),
						colony.cells_captured,
						colony.trophies,
					]
				)
			)
		)
	)
	lines.append("- " + tr_key("RECAP_UPGRADES") % _levels_text(defs, colony))
	lines.append("- " + tr_key("RECAP_MUTATIONS") % _mutations_text(defs, colony))
	lines.append("- " + tr_key("RECAP_TIER_TIMES") % _times_text(colony.tier_ticks, false))
	lines.append("- " + tr_key("RECAP_ZONE_TIMES") % _times_text(colony.zone_ticks, true))
	return lines


## Valeur affichée d'un réglage (sans zéros inutiles).
static func _value(param: SandboxParam, defs: SimDefs) -> String:
	var value: float = param.read(defs)
	return NumberFormat.decimal(roundi(value * 1000.0))


## Niveaux des améliorations achetées (« Dégâts 4, Cadence 2 »).
static func _levels_text(defs: SimDefs, colony: ColonyState) -> String:
	var parts := PackedStringArray()
	for index: int in range(defs.upgrades.size()):
		if colony.upgrade_levels[index] > 0:
			var name: String = tr_key(defs.upgrades[index].name_key)
			parts.append("%s %d" % [name, colony.upgrade_levels[index]])
	return tr_key("RECAP_NONE") if parts.is_empty() else ", ".join(parts)


static func _mutations_text(defs: SimDefs, colony: ColonyState) -> String:
	var parts := PackedStringArray()
	for index: int in colony.mutations:
		parts.append(tr_key(defs.mutations[index].name_key))
	return tr_key("RECAP_NONE") if parts.is_empty() else ", ".join(parts)


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
