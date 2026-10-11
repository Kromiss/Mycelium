extends GutTest
## Propagation automatique et points chauds (GDD §5 bis, décidé le 11 octobre 2026).

const Fixture = preload("res://tests/fixtures/sim_fixture.gd")
const CENTER := Vector2i(0, 0)
## Case libre voisine de ma case de bord, tournée vers le bord de la forêt (loin du centre).
const AWAY := Vector2i(11, -2)
## Case libre voisine de ma case vers le centre.
const TOWARD := Vector2i(9, 0)

var _sim: Simulation


func before_each() -> void:
	_sim = Fixture.duel(2, false)


func _colony(colony_id: int = 0) -> ColonyState:
	return _sim.state.colonies[colony_id]


func _cell(coords: Vector2i) -> int:
	return Fixture.cell(_sim, coords)


## PV perdus par une case libre.
func _lost(coords: Vector2i) -> int:
	var cell: int = _cell(coords)
	return _sim.cell_max_hp(cell) - _sim.state.hp[cell]


## PV perdus par toutes les cases libres.
func _total_lost() -> int:
	var total: int = 0
	for cell: int in range(_sim.state.cell_count()):
		if _sim.state.owner[cell] < 0:
			total += _sim.cell_max_hp(cell) - _sim.state.hp[cell]
	return total


func test_every_border_cell_pushes_including_the_sporophore() -> void:
	_sim.tick()
	assert_eq(_colony().border_cells, 3)
	assert_eq(_colony().push_force, 3_000)
	# Les 3 000 millièmes sont partagés : seuls les restes des divisions se perdent.
	assert_almost_eq(_total_lost() * 0.5, 3_000.0, 12.0)
	assert_gt(_lost(AWAY), 0)
	assert_gt(_lost(TOWARD), 0)


func test_the_force_is_capped() -> void:
	Fixture.give(_sim, 0, Fixture.line_to_center(12))
	_sim.tick()
	assert_eq(_colony().border_cells, 13)
	assert_eq(_colony().push_force, 8_000)


func test_push_and_vigor_upgrades_raise_push_and_cap() -> void:
	var defs: SimDefs = _sim.state.defs
	_colony().upgrade_levels[defs.upgrade_index(&"push")] = 4
	Fixture.give(_sim, 0, Fixture.line_to_center(12))
	_sim.tick()
	assert_eq(_colony().push_force, 8_000)
	_colony().upgrade_levels[defs.upgrade_index(&"vigor")] = 5
	_sim.tick()
	var cap: int = ColonyStats.push_cap(defs, _colony())
	assert_eq(cap, Fixed.mul(8_000, Fixed.mul(defs.tier_cap_pm[_colony().tier - 1], 2_000)))
	assert_eq(_colony().push_force, mini(cap, 2_000 * _colony().border_cells))


func test_a_hotspot_pulls_the_growth_toward_it() -> void:
	var other: Simulation = Fixture.duel(2, false)
	_sim.tick([HotspotCommand.new(CENTER, 0)])
	other.tick()
	var toward: int = _lost(TOWARD)
	var away: int = _lost(AWAY)
	var cell_toward: int = other.cell_index(TOWARD)
	var cell_away: int = other.cell_index(AWAY)
	assert_gt(toward, other.cell_max_hp(cell_toward) - other.state.hp[cell_toward])
	assert_lt(away, other.cell_max_hp(cell_away) - other.state.hp[cell_away])


func test_with_the_whole_share_only_cells_toward_the_hotspot_are_pushed() -> void:
	_sim.state.defs.hotspot_share_pm = 1_000
	_sim.tick([HotspotCommand.new(CENTER, 0)])
	assert_eq(_lost(AWAY), 0)
	assert_gt(_lost(TOWARD), 0)


func test_hotspots_share_their_part_equally() -> void:
	# Toute la force aux points chauds : avec un second point chaud, le premier n'en reçoit plus
	# que la moitié (à un reste de division près).
	var north: int = _cell(Vector2i(11, -6))
	var south: int = _cell(Vector2i(4, 7))
	var pulled := PackedInt32Array()
	for hotspots: PackedInt32Array in [PackedInt32Array([north]), PackedInt32Array([north, south])]:
		var sim: Simulation = Fixture.duel(2, false)
		sim.state.defs.hotspot_share_pm = 1_000
		sim.state.colonies[0].hotspots = hotspots
		PropagationSystem.new().run(sim.state, TickResult.new())
		var lost: int = 0
		for coords: Vector2i in [Vector2i(11, -2), Vector2i(10, -1)]:
			var cell: int = sim.cell_index(coords)
			lost += sim.cell_max_hp(cell) - sim.state.hp[cell]
		pulled.append(lost)
	assert_gt(pulled[0], 0)
	assert_almost_eq(float(pulled[1]), float(pulled[0]) * 0.5, 4.0)


func test_enemy_cells_are_not_pushed_during_the_protection() -> void:
	Fixture.give(_sim, 1, [TOWARD])
	_sim.tick()
	assert_eq(_lost(TOWARD), 0)
	_sim.state.tick = _sim.state.defs.protection_ticks
	_sim.tick()
	assert_gt(_lost(TOWARD), 0)


func test_pushing_an_enemy_sporophore_eliminates_it() -> void:
	_sim.state.tick = _sim.state.defs.protection_ticks
	Fixture.give(_sim, 0, [Vector2i(-10, 0)])
	_colony(1).turret_hp = 1
	_sim.tick()
	assert_false(_colony(1).alive)
	assert_eq(_colony(0).trophies, 1)


func test_hotspot_commands() -> void:
	var own: TickResult = _sim.tick([HotspotCommand.new(Fixture.INNER_0, 0)])
	assert_eq(own.refused_codes, PackedInt32Array([Refusal.Code.OWN_CELL]))
	var outside: TickResult = _sim.tick([HotspotCommand.new(Vector2i(40, 0), 0)])
	assert_eq(outside.refused_codes, PackedInt32Array([Refusal.Code.OUT_OF_MAP]))
	_sim.tick([HotspotCommand.new(CENTER, 0)])
	assert_eq(_colony().hotspots, PackedInt32Array([_cell(CENTER)]))
	# Au maximum (1 au départ), un nouveau point chaud remplace le plus ancien.
	_sim.tick([HotspotCommand.new(Vector2i(1, 0), 0)])
	assert_eq(_colony().hotspots, PackedInt32Array([_cell(Vector2i(1, 0))]))
	# Un clic sur un point chaud le retire.
	_sim.tick([HotspotCommand.new(Vector2i(1, 0), 0)])
	assert_true(_colony().hotspots.is_empty())


func test_a_free_cell_gets_taken_by_the_border() -> void:
	Fixture.run(_sim, 60)
	assert_gt(_colony().cell_count, 3)
	assert_gt(_colony().cells_captured, 0)
