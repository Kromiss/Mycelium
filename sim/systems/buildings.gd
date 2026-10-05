class_name Buildings
extends RefCounted
## Bâtiments (GDD §5 bis) : pose, démolition, chantier, chute, sommeil et réveil. Partagé par
## les commandes, le combat et l'étape des bâtiments du tick (BuildingSystem).


## Raison pour laquelle la pose serait refusée (OK si elle serait acceptée) : un bâtiment
## débloqué et payable, sur une de mes cases sans Sporophore ni bâtiment, avec une place libre.
static func check_build(
	state: GameState, colony: ColonyState, type: int, cell: int
) -> Refusal.Code:
	var defs: SimDefs = state.defs
	if type < 0 or type >= defs.buildings.size():
		return Refusal.Code.UNKNOWN_BUILDING
	var def: SimBuilding = defs.buildings[type]
	if colony.tier < def.unlock_tier:
		return Refusal.Code.TIER_LOCKED
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	if state.owner[cell] != colony.id:
		return Refusal.Code.NOT_OWNED
	if cell == colony.turret:
		return Refusal.Code.TURRET_CELL
	if state.building_at[cell] >= 0:
		return Refusal.Code.CELL_OCCUPIED
	if standing_count(state, colony.id) >= ColonyStats.building_slots(defs, colony):
		return Refusal.Code.NO_BUILDING_SLOT
	if colony.enzymes < Fixed.from_units(def.cost_enzymes):
		return Refusal.Code.NOT_ENOUGH_ENZYMES
	return Refusal.Code.OK


## Pose le bâtiment (déjà vérifié) : paie et ouvre le chantier, avec une part de ses PV max.
static func build(
	state: GameState, colony: ColonyState, type: int, cell: int, result: TickResult
) -> void:
	var defs: SimDefs = state.defs
	var def: SimBuilding = defs.buildings[type]
	colony.enzymes -= Fixed.from_units(def.cost_enzymes)
	var building := BuildingState.new()
	building.type = type
	building.owner = colony.id
	building.cell = cell
	building.ready_tick = state.tick + def.build_ticks
	var maximum: int = ColonyStats.building_max_hp(defs, colony, type)
	building.hp = maxi(1, Fixed.mul(maximum, defs.building_start_hp_pm))
	if def.build_ticks <= 0:
		building.hp = maximum
	state.building_at[cell] = state.buildings.size()
	state.buildings.append(building)
	_note(building, TickResult.BuildingEvent.BUILT, colony.id, result)


## Raison pour laquelle la démolition serait refusée (OK si elle serait acceptée) : un de mes
## bâtiments, en chantier ou actif.
static func check_demolish(state: GameState, colony: ColonyState, cell: int) -> Refusal.Code:
	if cell < 0:
		return Refusal.Code.OUT_OF_MAP
	var building: BuildingState = state.standing_building(cell)
	if building == null or building.owner != colony.id:
		return Refusal.Code.NO_BUILDING
	return Refusal.Code.OK


## Démolit le bâtiment (déjà vérifié) : il disparaît, sans remboursement, et sa place est
## rendue. Les cases qu'il tenait seul (îlot) redeviennent libres.
static func demolish(state: GameState, colony: ColonyState, cell: int, result: TickResult) -> void:
	var building: BuildingState = state.building_on(cell)
	_note(building, TickResult.BuildingEvent.DEMOLISHED, colony.id, result)
	remove(state, state.building_at[cell])
	Combat.cut_off(state, colony, result)


## Nombre de bâtiments de la colonie qui comptent pour les places : en chantier ou actifs
## (un bâtiment endormi n'appartient plus à personne jusqu'à son réveil).
static func standing_count(state: GameState, colony_id: int) -> int:
	var total: int = 0
	for building: BuildingState in state.buildings:
		if building.owner == colony_id and building.standing(state.tick):
			total += 1
	return total


## Inflige « amount » millièmes de dégâts à un bâtiment adverse. Il tombe à 0 PV si sa case
## touche le territoire de l'attaquant, ou si le tir vient d'un Mortier (« siege ») ; sinon ses
## PV ne descendent pas sous 1 millième.
static func damage(
	state: GameState,
	building: BuildingState,
	attacker: ColonyState,
	amount: int,
	result: TickResult,
	siege: bool,
) -> void:
	var left: int = building.hp - amount
	result.cell_changed(building.cell)
	result.colony_changed(building.owner)
	if left <= 0 and (siege or state.touches_colony(building.cell, attacker.id)):
		fall(state, building, attacker.id, result, true)
	else:
		building.hp = maxi(left, 1)


## Le bâtiment tombe : il s'endort (il ne fait rien et ne peut plus être frappé) ; à son
## réveil, il ira à la colonie qui tient alors sa case. « attacker » : colonie qui l'a abattu
## (−1 à une élimination). Si « cut », les cases que son propriétaire ne tient plus qu'à
## travers lui redeviennent libres.
static func fall(
	state: GameState, building: BuildingState, attacker: int, result: TickResult, cut: bool
) -> void:
	building.hp = 0
	building.asleep_until = state.tick + maxi(1, state.defs.building_sleep_ticks)
	building.ready_tick = 0
	building.targets = PackedInt32Array()
	building.shot_progress = 0
	_note(building, TickResult.BuildingEvent.FELL, attacker, result)
	var owner: ColonyState = state.colony(building.owner)
	if cut and owner != null and owner.alive:
		Combat.cut_off(state, owner, result)


## Retire le bâtiment de rang « index » de la carte.
static func remove(state: GameState, index: int) -> void:
	var cell: int = state.buildings[index].cell
	state.buildings.remove_at(index)
	state.building_at[cell] = -1
	for i: int in range(index, state.buildings.size()):
		state.building_at[state.buildings[i].cell] = i


## Étape 2 du tick : fin de chantier (PV au maximum) et réveils (la colonie qui tient la case
## obtient le bâtiment, à pleine vie ; personne : il disparaît).
static func update(state: GameState, result: TickResult) -> void:
	var index: int = 0
	while index < state.buildings.size():
		var building: BuildingState = state.buildings[index]
		if building.asleep_until > 0 and state.tick >= building.asleep_until:
			var holder: ColonyState = state.owner_of(building.cell)
			if holder == null or not holder.alive:
				_note(building, TickResult.BuildingEvent.VANISHED, building.owner, result)
				remove(state, index)
				continue
			building.owner = holder.id
			building.asleep_until = 0
			building.hp = ColonyStats.building_max_hp(state.defs, holder, building.type)
			_note(building, TickResult.BuildingEvent.WOKE, holder.id, result)
		elif building.ready_tick > 0 and state.tick == building.ready_tick:
			var owner: ColonyState = state.colonies[building.owner]
			building.hp = ColonyStats.building_max_hp(state.defs, owner, building.type)
			_note(building, TickResult.BuildingEvent.COMPLETED, building.owner, result)
		index += 1


## PV regagnés par seconde : le chantier monte jusqu'aux PV max ; un bâtiment actif se
## régénère comme une case (régénération de sa colonie), sauf sous Toxique ou Nuage. Le
## Sporophore ne peut pas le soigner.
static func regenerate(state: GameState, rates: PackedInt64Array, result: TickResult) -> void:
	var defs: SimDefs = state.defs
	for building: BuildingState in state.buildings:
		if not building.standing(state.tick):
			continue
		var owner: ColonyState = state.colonies[building.owner]
		var maximum: int = ColonyStats.building_max_hp(defs, owner, building.type)
		var before: int = building.hp
		if building.hp > maximum:
			building.hp = maximum
		elif building.building_up(state.tick):
			var ticks: int = maxi(1, defs.buildings[building.type].build_ticks)
			var start: int = Fixed.mul(maximum, defs.building_start_hp_pm)
			@warning_ignore("integer_division")
			var gain: int = maxi(1, (maximum - start) / ticks)
			building.hp = mini(maximum, building.hp + gain)
		elif building.hp < maximum and state.no_regen_until[building.cell] <= state.tick:
			building.hp = mini(maximum, building.hp + Fixed.mul(maximum, rates[owner.id]))
		if building.hp != before:
			result.cell_changed(building.cell)


## Bâtiments de la colonie, en chantier ou actifs (pas endormis), dans l'ordre de construction.
static func of_colony(state: GameState, colony_id: int) -> Array[BuildingState]:
	var found: Array[BuildingState] = []
	for building: BuildingState in state.buildings:
		if building.owner == colony_id and building.standing(state.tick):
			found.append(building)
	return found


static func _note(building: BuildingState, event: int, colony_id: int, result: TickResult) -> void:
	result.building_events.append_array(PackedInt32Array([event, building.cell, colony_id]))
	result.key_changes.append(building.cell)
	result.cell_changed(building.cell)
	if colony_id >= 0:
		result.colony_changed(colony_id)
	if building.owner >= 0 and building.owner != colony_id:
		result.colony_changed(building.owner)
