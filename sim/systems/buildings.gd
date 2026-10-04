class_name Buildings
extends RefCounted
## Règles du city builder (GDD §7) : pose et démolition, file de construction et chantiers,
## activation selon le palier, et effets des bâtiments (rendement, voisinage, Rosace, Enzymes,
## plafond de stock, pousse, chantiers et pousses simultanés). Partagées par les systèmes de la
## simulation et par les requêtes de l'interface.

## Nombre de voisines d'une case : une Rosace a ses 6 voisines possédées (GDD §7.3).
const ROSACE_NEIGHBORS: int = 6
const SECONDS_PER_MINUTE: int = 60


## Coût d'un nouveau bâtiment de ce type, en millièmes de nutriment :
## U × coût du bâtiment × 1,12 ^ (bâtiments du même type, construits, en chantier ou en file).
static func cost(state: GameState, colony: ColonyState, type: int) -> int:
	var defs: SimDefs = state.defs
	var count: int = clampi(count_of(state, colony, type), 0, defs.building_pow_table.size() - 1)
	var base: int = defs.unit_cost * defs.buildings[type].cost_units
	return Fixed.mul(base, defs.building_pow_table[count])


## Coût en Enzymes (millièmes) d'un nouveau bâtiment de ce type.
static func enzyme_cost(state: GameState, type: int) -> int:
	return Fixed.from_units(state.defs.buildings[type].cost_enzymes)


## Bâtiments de ce type que possède la colonie (construits, en chantier ou en file).
static func count_of(state: GameState, colony: ColonyState, type: int) -> int:
	var total: int = 0
	for cell: int in range(state.cell_count()):
		if state.building[cell] == type and state.owner[cell] == colony.id:
			total += 1
	return total


## Durée d'un chantier de ce type, en secondes (selon son palier de déblocage).
static func build_ticks(state: GameState, type: int) -> int:
	var ticks: PackedInt32Array = state.defs.build_ticks_by_tier
	var tier: int = clampi(state.defs.buildings[type].unlock_tier, 0, ticks.size() - 1)
	return ticks[tier]


## Vrai si la colonie a atteint le palier qui débloque ce type.
static func is_unlocked(state: GameState, colony: ColonyState, type: int) -> bool:
	return colony.tier >= state.defs.buildings[type].unlock_tier


# --- Pose et démolition ---


## Peut-on poser ce bâtiment sur cette case ?
static func check_build(
	state: GameState, colony: ColonyState, cell: int, type: int
) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if not state.is_owned_by(cell, colony.id):
		return Refusal.Code.NOT_OWNED
	if cell == colony.heart:
		return Refusal.Code.HEART_CELL
	if state.building[cell] >= 0:
		return Refusal.Code.CELL_OCCUPIED
	if type < 0 or type >= state.defs.buildings.size():
		return Refusal.Code.UNKNOWN_BUILDING
	if not is_unlocked(state, colony, type):
		return Refusal.Code.TIER_LOCKED
	var def: SimBuilding = state.defs.buildings[type]
	if not _placement_ok(state, colony, cell, def):
		return Refusal.Code.BAD_PLACEMENT
	if def.max_count > 0 and count_of(state, colony, type) >= def.max_count:
		return Refusal.Code.BUILDING_LIMIT
	if colony.build_load() >= state.defs.build_queue_size:
		return Refusal.Code.BUILD_QUEUE_FULL
	if colony.nutrients < cost(state, colony, type):
		return Refusal.Code.NOT_ENOUGH_NUTRIENTS
	if colony.enzymes < enzyme_cost(state, type):
		return Refusal.Code.NOT_ENOUGH_ENZYMES
	return Refusal.Code.OK


## Pose le bâtiment : il est payé et entre dans la file de construction.
static func build(
	state: GameState, colony: ColonyState, cell: int, type: int, result: TickResult
) -> void:
	var paid: int = cost(state, colony, type)
	var paid_enzymes: int = enzyme_cost(state, type)
	colony.nutrients -= paid
	colony.enzymes -= paid_enzymes
	state.building[cell] = type
	state.building_state[cell] = GameState.BuildState.QUEUED
	state.building_paid[cell] = paid
	state.building_paid_enzymes[cell] = paid_enzymes
	colony.build_queue.append(cell)
	result.cell_changed(cell)
	result.colony_changed(colony.id)


## Peut-on démolir le bâtiment de cette case ?
static func check_demolish(state: GameState, colony: ColonyState, cell: int) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if state.building[cell] < 0 or state.owner[cell] != colony.id:
		return Refusal.Code.NO_BUILDING
	return Refusal.Code.OK


## Nutriments rendus si l'on démolit maintenant le bâtiment de la case : tout le prix payé s'il
## est encore en file, le remboursement de démolition (50 %) sinon.
static func refund(state: GameState, cell: int) -> int:
	if state.building_state[cell] == GameState.BuildState.QUEUED:
		return state.building_paid[cell]
	return Fixed.mul(state.building_paid[cell], state.defs.demolish_refund_pm)


## Démolit tout de suite : un bâtiment en file est remboursé en entier, un chantier lancé ou
## un bâtiment construit à hauteur du remboursement de démolition (50 %).
static func demolish(state: GameState, colony: ColonyState, cell: int, result: TickResult) -> void:
	var refund_pm: int = state.defs.demolish_refund_pm
	colony.nutrients += refund(state, cell)
	match state.building_state[cell]:
		GameState.BuildState.QUEUED:
			refund_pm = Fixed.ONE
			colony.build_queue.remove_at(colony.build_queue.find(cell))
		GameState.BuildState.CONSTRUCTING:
			colony.constructing.remove_at(colony.constructing.find(cell))
	colony.enzymes += Fixed.mul(state.building_paid_enzymes[cell], refund_pm)
	clear(state, cell)
	result.cell_changed(cell)
	result.colony_changed(colony.id)


## Retire le bâtiment d'une case, sans remboursement.
static func clear(state: GameState, cell: int) -> void:
	state.building[cell] = -1
	state.building_state[cell] = GameState.BuildState.NONE
	state.build_left[cell] = 0
	state.building_paid[cell] = 0
	state.building_paid_enzymes[cell] = 0
	state.building_active[cell] = 0


# --- File de construction et chantiers ---


## Chantiers simultanés de la colonie : 2 + Pépinières actives, 4 au plus (GDD §7.1).
static func sites(state: GameState, colony: ColonyState) -> int:
	var extra: int = 0
	for cell: int in _active_cells(state, colony):
		extra += state.defs.buildings[state.building[cell]].extra_sites
	return mini(state.defs.max_build_sites, state.defs.base_build_sites + extra)


## Pousses simultanées de la colonie : 1 + Mycorhizes actives, 3 au plus (GDD §4.4).
static func max_growths(state: GameState, colony: ColonyState) -> int:
	var extra: int = 0
	for cell: int in _active_cells(state, colony):
		extra += state.defs.buildings[state.building[cell]].extra_growths
	return mini(state.defs.max_growths_cap, state.defs.max_growths + extra)


## Démarre, dans l'ordre d'ajout, les bâtiments de la file tant qu'un chantier est libre. Un
## bâtiment dont le palier n'est plus atteint attend dans la file sans bloquer les suivants
## (décidé le 4 octobre 2026).
static func start_queued(state: GameState, colony: ColonyState, result: TickResult) -> void:
	var free: int = sites(state, colony) - colony.constructing.size()
	var index: int = 0
	while free > 0 and index < colony.build_queue.size():
		var cell: int = colony.build_queue[index]
		if not is_unlocked(state, colony, state.building[cell]):
			index += 1
			continue
		colony.build_queue.remove_at(index)
		state.building_state[cell] = GameState.BuildState.CONSTRUCTING
		state.build_left[cell] = build_ticks(state, state.building[cell])
		colony.constructing.append(cell)
		result.cell_changed(cell)
		free -= 1


## Fait avancer les chantiers d'un tick ; un chantier terminé devient un bâtiment construit.
static func advance(state: GameState, colony: ColonyState, result: TickResult) -> void:
	var still := PackedInt32Array()
	for cell: int in colony.constructing:
		state.build_left[cell] -= 1
		result.cell_changed(cell)
		if state.build_left[cell] > 0:
			still.append(cell)
			continue
		state.building_state[cell] = GameState.BuildState.BUILT
		result.buildings_completed.append_array(PackedInt32Array([colony.id, cell]))
		result.colony_changed(colony.id)
	colony.constructing = still


## Recalcule les bâtiments actifs : construits, et palier de déblocage atteint (GDD §7.6).
static func refresh_activity(state: GameState) -> void:
	for cell: int in range(state.cell_count()):
		var type: int = state.building[cell]
		var active: int = 0
		if type >= 0 and state.building_state[cell] == GameState.BuildState.BUILT:
			var colony: ColonyState = state.colony(state.owner[cell])
			if colony != null and is_unlocked(state, colony, type):
				active = 1
		state.building_active[cell] = active


# --- Effets ---


## Vitesse de pousse d'une case, en millièmes de seconde par tick : une Pépinière active de la
## colonie à portée réduit la durée (−30 % : 1000 / 0,7) ; plusieurs ne se cumulent pas. La
## vitesse est recalculée à chaque tick (décidé le 4 octobre 2026).
static func growth_speed(state: GameState, colony: ColonyState, cell: int) -> int:
	var reduction: int = 0
	var here: Vector2i = state.map.cells[cell]
	for other: int in _active_cells(state, colony):
		var def: SimBuilding = state.defs.buildings[state.building[other]]
		if def.growth_reduction_pm <= reduction:
			continue
		if Hex.distance(here, state.map.cells[other]) <= def.effect_radius:
			reduction = def.growth_reduction_pm
	var remaining: int = maxi(1, Fixed.ONE - reduction)
	return Fixed.div_round(Fixed.ONE * Fixed.ONE, remaining)


## Multiplicateur (pour-mille) du bâtiment sur la production de sa case : bonus de rendement,
## voisinage des bâtiments du même type et Rosace, qui se multiplient (GDD §7.3).
static func production_factor(state: GameState, colony_id: int, cell: int) -> int:
	var type: int = state.active_building(cell)
	if type < 0:
		return Fixed.ONE
	var def: SimBuilding = state.defs.buildings[type]
	if def.yield_bonus_pm == 0:
		return Fixed.ONE
	return Fixed.mul(Fixed.ONE + def.yield_bonus_pm, _synergy(state, colony_id, cell, def, type))


## Enzymes produites par une case en un tick (millièmes), voisinage et Rosace compris.
static func enzyme_production(state: GameState, colony_id: int, cell: int) -> int:
	var type: int = state.active_building(cell)
	if type < 0:
		return 0
	var def: SimBuilding = state.defs.buildings[type]
	if def.enzymes_per_minute == 0:
		return 0
	var per_minute: int = Fixed.mul(
		Fixed.from_units(def.enzymes_per_minute), _synergy(state, colony_id, cell, def, type)
	)
	return Fixed.div_round(per_minute, SECONDS_PER_MINUTE)


## Secondes de production du plafond de stock : 3 min + 2 min par Grenier actif (GDD §5).
static func stock_seconds(state: GameState, colony: ColonyState) -> int:
	var seconds: int = state.defs.stock_cap_seconds
	for cell: int in _active_cells(state, colony):
		seconds += state.defs.buildings[state.building[cell]].stock_minutes * SECONDS_PER_MINUTE
	return seconds


## Multiplicateur de voisinage et de Rosace (pour-mille) qu'aurait un bâtiment de ce type sur
## la case avec « extra » voisins actifs du même type en plus (pour les robots, qui estiment
## ce qu'une pose rapporterait).
static func synergy_with(state: GameState, colony_id: int, cell: int, type: int, extra: int) -> int:
	return _synergy(state, colony_id, cell, state.defs.buildings[type], type, extra)


## Vrai si la règle de pose du bâtiment accepte la case (GDD §7.4).
static func placement_ok(state: GameState, colony: ColonyState, cell: int, type: int) -> bool:
	return _placement_ok(state, colony, cell, state.defs.buildings[type])


## Voisinage (+X % par bâtiment actif du même type adjacent, plafonné) × Rosace.
static func _synergy(
	state: GameState, colony_id: int, cell: int, def: SimBuilding, type: int, extra: int = 0
) -> int:
	var same: int = extra
	for direction: int in range(6):
		var other: int = state.map.neighbor_index(cell, direction)
		if other >= 0 and state.owner[other] == colony_id and state.active_building(other) == type:
			same += 1
	var neighbors: int = mini(def.neighbor_bonus_max_pm, def.neighbor_bonus_pm * same)
	var factor: int = Fixed.ONE + neighbors
	if state.owned_neighbors(cell, colony_id) >= ROSACE_NEIGHBORS:
		factor = Fixed.mul(factor, Fixed.ONE + def.rosace_bonus_pm)
	return factor


## Cases de la colonie qui portent un bâtiment actif.
static func _active_cells(state: GameState, colony: ColonyState) -> PackedInt32Array:
	var cells := PackedInt32Array()
	for cell: int in range(state.cell_count()):
		if state.building_active[cell] == 1 and state.owner[cell] == colony.id:
			cells.append(cell)
	return cells


static func _placement_ok(
	state: GameState, colony: ColonyState, cell: int, def: SimBuilding
) -> bool:
	match def.placement:
		BuildingDef.Placement.FRONTIER:
			return state.is_frontier(cell, colony.id)
		BuildingDef.Placement.INNER:
			return not state.is_frontier(cell, colony.id)
	return true
