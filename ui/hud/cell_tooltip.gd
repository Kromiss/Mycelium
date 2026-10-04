class_name CellTooltip
extends RefCounted
## Contenu de l'info-bulle d'une case (provisoire, G3 étape 1) : à qui elle est, sa zone, ses
## PV, sa production si elle est à moi, et si ma Tourelle peut la viser (sinon pourquoi).
## Les chiffres viennent de la simulation.


## Lignes de l'info-bulle de la case « cell » (numéro de case), déjà traduites.
static func lines(session: Session, cell: int) -> PackedStringArray:
	var simulation: Simulation = session.simulation
	var state: GameState = simulation.state
	var colony: ColonyState = session.colony()
	var holder: ColonyState = state.owner_of(cell)
	var result := PackedStringArray()
	if holder != null and holder.turret == cell:
		result.append(_t("TIP_TURRET"))
		var maximum: int = ColonyStats.turret_max_hp(state.defs, holder)
		result.append(
			_t("TIP_HP") % [NumberFormat.amount(holder.turret_hp), NumberFormat.amount(maximum)]
		)
	else:
		if holder == null:
			result.append(_t("TIP_FREE"))
		elif holder == colony:
			result.append(_t("TIP_OWNED"))
		else:
			result.append(_t("TIP_ENEMY"))
		var hp: String = NumberFormat.amount(state.hp[cell])
		result.append(_t("TIP_HP") % [hp, NumberFormat.amount(simulation.cell_max_hp(cell))])
	result.append(_t("TIP_ZONE") % state.map.zones[cell])
	if holder == colony:
		var production: int = Fixed.mul(
			ColonyStats.cell_production(state, colony, cell),
			ColonyStats.production_factor(state, colony)
		)
		result.append(_t("TIP_PRODUCTION") % NumberFormat.rate(production))
	if colony.alive and cell != colony.turret:
		var command := TargetCommand.new(state.map.cells[cell], colony.id)
		var code: Refusal.Code = simulation.check(command)
		if code == Refusal.Code.OK:
			result.append(_t("TIP_TARGETABLE"))
		elif holder != colony or code != Refusal.Code.NOT_WOUNDED:
			result.append(MapInput.refusal_text(code))
	return result


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
