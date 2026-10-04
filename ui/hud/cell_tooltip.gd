class_name CellTooltip
extends RefCounted
## Contenu de l'info-bulle d'une case (GDD §15 lignes G1 et G2) : zone, et selon l'état de la
## case son coût, sa durée de pousse et sa production ; son bâtiment (nom, état, effet) ; en
## mode palette, le coût de la pose ou la raison du refus. Les chiffres viennent de la simulation.


## Lignes de l'info-bulle de la case « cell » (numéro de case), déjà traduites. « placing » :
## bâtiment choisi dans la palette (vide sinon).
static func lines(session: Session, cell: int, placing: StringName = &"") -> PackedStringArray:
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
		result.append(_t("TIP_GROWING") % Expansion.growth_seconds_left(state, cell))
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
	if state.building[cell] >= 0 and state.owner[cell] == colony.id:
		result.append("")
		result.append_array(BuildingText.lines(session, cell))
	if placing != &"":
		result.append("")
		result.append(_placing_line(session, coords, placing))
	return result


## Ligne du mode palette : coût de la pose, ou raison du refus.
static func _placing_line(session: Session, coords: Vector2i, placing: StringName) -> String:
	var simulation: Simulation = session.simulation
	var code: Refusal.Code = simulation.check_build(session.local_colony, coords, placing)
	if code != Refusal.Code.OK:
		return MapInput.refusal_text(code)
	var type: int = simulation.state.defs.building_index(placing)
	var building: SimBuilding = simulation.state.defs.buildings[type]
	return (
		_t("TIP_BUILD_HERE")
		% [BuildingText.name_of(building), BuildingText.cost_text(session, building)]
	)


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
