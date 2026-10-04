class_name CellTooltip
extends RefCounted
## Contenu de l'info-bulle d'une case (GDD §15 ligne G1) : zone, et selon l'état de la case
## son coût, sa durée de pousse et sa production. Les chiffres viennent de la simulation.


## Lignes de l'info-bulle de la case « cell » (numéro de case), déjà traduites.
static func lines(session: Session, cell: int) -> PackedStringArray:
	var simulation: Simulation = session.simulation
	var state: GameState = simulation.state
	var colony: ColonyState = session.colony()
	var coords: Vector2i = state.map.cells[cell]
	var result := PackedStringArray()
	if cell == colony.heart:
		result.append(_t("TIP_HEART"))
	elif state.is_owned_by(cell, colony.id):
		result.append(_t("TIP_OWNED"))
	elif state.cell_state[cell] == GameState.CellState.GROWING:
		result.append(_t("TIP_GROWING") % state.growth_left[cell])
	else:
		result.append(_t("TIP_FREE"))
		var rank: int = colony.queue.find(cell)
		if rank >= 0:
			result.append(_t("TIP_QUEUED") % (rank + 1))
	result.append(_t("TIP_ZONE") % state.map.zones[cell])
	var production: String = NumberFormat.rate(simulation.cell_production(colony.id, coords))
	if state.cell_state[cell] == GameState.CellState.OWNED:
		result.append(_t("TIP_PRODUCTION") % production)
	else:
		result.append(
			_t("TIP_COST") % NumberFormat.amount(simulation.colonize_cost(colony.id, coords))
		)
		result.append(_t("TIP_GROWTH") % simulation.growth_ticks(coords))
		result.append(_t("TIP_PRODUCTION_ONCE") % production)
	return result


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
