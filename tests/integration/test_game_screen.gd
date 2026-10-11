extends GutTest
## Écran de partie (maquettes G3 ; propagation, G6) : panneau de droite, points chauds au clic,
## cartes de mutation, journal, et carte limitée à la partie gauche de l'écran.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const GAME: PackedScene = preload("res://game/game_screen.tscn")
const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _locale: String
var _screen: Node
var _session: Session
var _hud: Hud
var _input: MapInput


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	SceneRouter.game_config = GameConfig.defaults(DUEL, 7)
	_screen = GAME.instantiate()
	add_child_autofree(_screen)
	_session = _screen.get_node("%Session")
	_session.set_process(false)
	_hud = _screen.get_node("%Hud")
	_input = _screen.get_node("%MapInput")


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.game_config = null


func _colony() -> ColonyState:
	return _session.colony()


## Donne des cases à la colonie du joueur (une ligne vers le centre).
func _grow(length: int) -> void:
	Fixture.give(_session.simulation, 0, Fixture.line_to_center(length))


## Donne 40 cases à la colonie du joueur (palier 4 : deux choix de mutation).
func _grow_to_tier_four() -> void:
	_grow(18)
	var row: Array[Vector2i] = []
	for q: int in range(10, -12, -1):
		row.append(Vector2i(q, 1))
	Fixture.give(_session.simulation, 0, row)


func test_the_map_takes_the_left_part_of_the_screen() -> void:
	var area: Rect2 = _hud.map_rect()
	var screen: Vector2 = _hud.get_viewport_rect().size
	assert_almost_eq(area.end.x / screen.x, 0.6172, 0.01)
	var camera: MapCamera = _screen.get_node("%MapCamera")
	assert_eq(camera.view_rect, area)


func test_the_propagation_card_shows_push_force_border_and_hotspots() -> void:
	_session.step()
	var card: PropagationCard = _hud.propagation_card()
	assert_eq(card.stat_text(0), "3/s")
	assert_eq(card.stat_text(1), "8 / 8")
	assert_eq(card.stat_text(2), "3")
	assert_eq(card.stat_text(3), "0 / 1")


func test_clicks_place_and_remove_hotspots() -> void:
	var messages: Array[String] = []
	_input.message.connect(func(text: String) -> void: messages.append(text))
	var center: int = _session.simulation.cell_index(Vector2i.ZERO)
	_input.click(center)
	# Le point chaud est posé au clic, sans attendre le tick.
	assert_eq(_colony().hotspots, PackedInt32Array([center]))
	_input.click(center)
	assert_true(_colony().hotspots.is_empty())
	_input.click(center)
	_input.right_click(_session.simulation.cell_index(Vector2i(1, 0)))
	assert_eq(_colony().hotspots.size(), 1)
	_input.right_click(center)
	assert_true(_colony().hotspots.is_empty())
	_input.click(_session.simulation.cell_index(Fixture.INNER_0))
	assert_eq(messages, ["This cell is already yours"])


func test_upgrade_buttons_buy_one_ten_or_the_maximum() -> void:
	_colony().nutrients = 100_000_000
	var card: UpgradesCard = _hud.upgrades_card()
	card.refresh()
	card.buy_button(&"push").pressed.emit()
	# L'achat est fait au clic, sans attendre le tick.
	assert_eq(_colony().upgrade_levels[0], 1)
	card.select_count(10)
	assert_string_starts_with(card.buy_button(&"push").text, "+10 · ")
	card.buy_button(&"push").pressed.emit()
	assert_eq(_colony().upgrade_levels[0], 11)
	_session.step()
	assert_eq(_colony().upgrade_levels[0], 11)


func test_locked_upgrades_show_the_tier_they_need() -> void:
	var card: UpgradesCard = _hud.upgrades_card()
	card.select_tab(UpgradeDef.Tab.DEFENSE)
	var button: Button = card.buy_button(&"regen")
	assert_true(button.disabled)
	assert_eq(button.text, "—")
	assert_null(card.buy_button(&"push"))


func test_mutation_cards_appear_hide_with_the_eye_and_come_back() -> void:
	_grow(10)
	_session.step()
	assert_true(_hud.is_offer_visible())
	var overlay: MutationOverlay = _hud.mutation_overlay()
	assert_true(overlay.card(0).visible)
	overlay.eye_button.pressed.emit()
	assert_false(_hud.is_offer_visible())
	var reopen: Button = _hud.mutations_card().reopen_button
	assert_true(reopen.visible)
	reopen.pressed.emit()
	assert_true(_hud.is_offer_visible())
	var offered: int = _colony().pending_offers[1]
	overlay.card(1).pressed.emit()
	_session.step()
	assert_eq(_colony().mutations, PackedInt32Array([offered]))
	assert_eq(_colony().mutation_tiers, PackedInt32Array([2]))
	assert_false(_hud.is_offer_visible())
	assert_false(reopen.visible)


func test_chosen_mutations_fit_on_one_line_of_icons() -> void:
	var card: MutationsCard = _hud.mutations_card()
	card.refresh(false)
	var empty_height: float = card.get_combined_minimum_size().y
	_grow_to_tier_four()
	_session.step()
	_hud.choose_mutation(0)
	_session.step()
	_hud.choose_mutation(0)
	_session.step()
	card.refresh(false)
	assert_eq(card.icon_count(), 2)
	# Le cadre garde la hauteur d'une seule ligne, quel que soit le nombre de mutations.
	assert_almost_eq(card.get_combined_minimum_size().y, empty_height, 1.0)


func test_stacked_choices_show_one_after_the_other() -> void:
	_grow_to_tier_four()
	_session.step()
	assert_eq(_colony().pending_offers.size(), 6)
	_hud.choose_mutation(0)
	_session.step()
	assert_true(_hud.is_offer_visible())
	_hud.choose_mutation(1)
	_session.step()
	assert_eq(_colony().mutations.size(), 2)
	assert_false(_hud.is_offer_visible())


func test_the_journal_notes_tiers_mutations_and_the_end_of_protection() -> void:
	_grow(10)
	_session.step()
	_hud.choose_mutation(0)
	_session.step()
	var texts: PackedStringArray = _hud.journal().texts()
	assert_string_contains(texts[0], "Mutation chosen: ")
	var lots: PackedInt32Array = _session.simulation.state.defs.tier_enzymes
	assert_eq(texts[1], "00:00 · Tier 2 reached: +%d Enzymes" % lots[1])
	_session.simulation.state.tick = _session.simulation.state.defs.protection_ticks - 1
	_session.step()
	assert_string_contains(_hud.journal().texts()[0], "Starting protection over")


func test_mutation_keys_choose_a_card_only_while_the_cards_are_shown() -> void:
	var press := InputEventAction.new()
	press.action = &"mutation_1"
	press.pressed = true
	_screen.call("_unhandled_input", press)
	_session.step()
	assert_true(_colony().mutations.is_empty())
	_grow(10)
	_session.step()
	_screen.call("_unhandled_input", press)
	_session.step()
	assert_eq(_colony().mutations.size(), 1)


func test_the_sporophore_grows_with_the_tiers() -> void:
	assert_eq(TurretArt.stage_for(0), 0)
	assert_eq(TurretArt.stage_for(2), 0)
	assert_eq(TurretArt.stage_for(3), 1)
	assert_eq(TurretArt.stage_for(4), 1)
	assert_eq(TurretArt.stage_for(5), 2)
	assert_eq(TurretArt.stage_for(6), 2)


func test_upgrade_effects_show_before_and_after() -> void:
	var simulation: Simulation = _session.simulation
	var defs: SimDefs = simulation.state.defs
	var push: SimUpgrade = defs.upgrades[defs.upgrade_index(&"push")]
	var values: PackedInt64Array = simulation.upgrade_values(0, &"push", 2)
	assert_eq(values, PackedInt64Array([3_000, 4_500]))
	assert_eq(GameText.upgrade_effect(push, values), "+25 % per level · 3.0 → 4.5 HP/s per cell")
	var vigor: SimUpgrade = defs.upgrades[defs.upgrade_index(&"vigor")]
	var caps: PackedInt64Array = simulation.upgrade_values(0, &"vigor", 1)
	assert_eq(GameText.upgrade_effect(vigor, caps), "+25 % per level · 8.0 → 10.0 HP/s at most")
