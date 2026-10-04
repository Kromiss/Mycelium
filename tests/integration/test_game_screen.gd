extends GutTest
## Écran de partie (maquettes G3, étape 2) : panneau de droite, cartes de mutation, journal,
## capacités, et carte limitée à la partie gauche de l'écran.

const DUEL: ModeDef = preload("res://data/modes/duel.tres")
const GAME: PackedScene = preload("res://game/sandbox_screen.tscn")
const Fixture = preload("res://tests/fixtures/sim_fixture.gd")

var _locale: String
var _screen: Node
var _session: Session
var _hud: Hud
var _input: MapInput


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")
	SceneRouter.sandbox_config = SandboxConfig.defaults(DUEL, 7)
	_screen = GAME.instantiate()
	add_child_autofree(_screen)
	_session = _screen.get_node("%Session")
	_session.set_process(false)
	_hud = _screen.get_node("%Hud")
	_input = _screen.get_node("%MapInput")


func after_each() -> void:
	TranslationServer.set_locale(_locale)
	SceneRouter.sandbox_config = null


func _colony() -> ColonyState:
	return _session.colony()


## Donne des cases à la colonie du joueur (une ligne vers le centre).
func _grow(length: int) -> void:
	Fixture.give(_session.simulation, 0, Fixture.line_to_center(length))


func test_the_map_takes_the_left_part_of_the_screen() -> void:
	var area: Rect2 = _hud.map_rect()
	var screen: Vector2 = _hud.get_viewport_rect().size
	assert_almost_eq(area.end.x / screen.x, 0.6172, 0.01)
	var camera: MapCamera = _screen.get_node("%MapCamera")
	assert_eq(camera.view_rect, area)


func test_priority_buttons_set_the_firing_priority() -> void:
	var card: TurretCard = _hud.turret_card()
	card.priority_button(ColonyState.Priority.ENEMIES_FIRST).pressed.emit()
	_session.step()
	assert_eq(_colony().priority, ColonyState.Priority.ENEMIES_FIRST)


func test_upgrade_buttons_buy_one_ten_or_the_maximum() -> void:
	_colony().nutrients = 100_000_000
	var card: UpgradesCard = _hud.upgrades_card()
	card.refresh()
	card.buy_button(&"damage").pressed.emit()
	_session.step()
	assert_eq(_colony().upgrade_levels[0], 1)
	card.select_count(10)
	assert_string_starts_with(card.buy_button(&"damage").text, "+10 · ")
	card.buy_button(&"damage").pressed.emit()
	_session.step()
	assert_eq(_colony().upgrade_levels[0], 11)


func test_locked_upgrades_show_the_tier_they_need() -> void:
	var card: UpgradesCard = _hud.upgrades_card()
	card.select_tab(UpgradeDef.Tab.DEFENSE)
	var button: Button = card.buy_button(&"regen")
	assert_true(button.disabled)
	assert_eq(button.text, "—")
	assert_null(card.buy_button(&"damage"))


func test_abilities_show_their_state_and_salvo_fires_at_once() -> void:
	var bar: AbilityBar = _hud.ability_bar()
	assert_string_starts_with(bar.state_text(0), "Tier 1")
	_colony().tier_ticks.fill(0)
	_grow(5)
	_session.simulation.state.tick = _session.simulation.state.defs.protection_ticks
	_colony().enzymes = 1_000_000
	_session.step()
	assert_string_starts_with(bar.state_text(0), "Ready · 20 Enz.")
	_input.use_ability(0)
	_session.step()
	assert_gt(_colony().salvo_until, _session.simulation.state.tick - 1)


func test_wall_and_cloud_wait_for_a_cell() -> void:
	_colony().tier_ticks.fill(0)
	_grow(20)
	_session.simulation.state.tick = _session.simulation.state.defs.protection_ticks
	_colony().enzymes = 1_000_000
	_session.step()
	_input.use_ability(1)
	assert_eq(_input.mode(), MapInput.Mode.ABILITY)
	var hint: Label = _hud.get_node("%HintLabel")
	assert_string_contains(hint.text, "Mycelium wall")
	_input.click(_session.simulation.cell_index(Fixture.TURRET_0))
	assert_eq(_input.mode(), MapInput.Mode.TARGET)
	_session.step()
	assert_eq(_colony().wall_center, _session.simulation.cell_index(Fixture.TURRET_0))


func test_abilities_are_refused_during_the_protection() -> void:
	var messages: Array[String] = []
	_input.message.connect(func(text: String) -> void: messages.append(text))
	_colony().tier = 1
	_colony().enzymes = 1_000_000
	_input.use_ability(0)
	assert_eq(messages, ["Not during the starting protection"])


func test_mutation_cards_appear_hide_with_the_eye_and_come_back() -> void:
	_grow(5)
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
	assert_eq(_colony().mutation_tiers, PackedInt32Array([1]))
	assert_false(_hud.is_offer_visible())
	assert_false(reopen.visible)


func test_stacked_choices_show_one_after_the_other() -> void:
	_grow(10)
	_session.step()
	assert_eq(_colony().pending_offers.size(), 6)
	_hud.choose_mutation(0)
	_session.step()
	assert_true(_hud.is_offer_visible())
	_hud.choose_mutation(2)
	_session.step()
	assert_eq(_colony().mutations.size(), 2)
	assert_false(_hud.is_offer_visible())


func test_the_journal_notes_tiers_mutations_and_the_end_of_protection() -> void:
	_grow(5)
	_session.step()
	_hud.choose_mutation(0)
	_session.step()
	var texts: PackedStringArray = _hud.journal().texts()
	assert_string_contains(texts[0], "Mutation chosen: ")
	assert_eq(texts[1], "00:00 · Tier 1 reached: +20 Enzymes")
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
	_grow(5)
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
	var damage: SimUpgrade = defs.upgrades[defs.upgrade_index(&"damage")]
	var values: PackedInt64Array = simulation.upgrade_values(0, &"damage", 1)
	assert_eq(values, PackedInt64Array([10_000, 12_500]))
	assert_eq(GameText.upgrade_effect(damage, values), "+25 % per level · 10 → 12")
	var rate: SimUpgrade = defs.upgrades[defs.upgrade_index(&"rate")]
	var rates: PackedInt64Array = simulation.upgrade_values(0, &"rate", 3)
	assert_eq(GameText.upgrade_effect(rate, rates), "+10 % per level · 1 → 1.3 shots/s")
