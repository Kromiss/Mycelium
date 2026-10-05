class_name HudJournal
extends RefCounted
## Ce que le journal retient d'un tick (maquette « Écran de partie ») : attaques contre mes
## cases (une alerte par colonie au plus toutes les N secondes), cases prises par une autre
## colonie, paliers atteints, fin de la protection, éliminations. Les mutations choisies sont
## notées par le HUD.


## Ajoute au journal les faits du tick. « last_alert » : dernière alerte d'attaque de chaque
## colonie (tick), mis à jour ; « alert_ticks » : délai minimal entre deux alertes.
static func record(
	journal: JournalCard,
	result: TickResult,
	session: Session,
	last_alert: Dictionary[int, int],
	alert_ticks: int
) -> void:
	var state: GameState = session.simulation.state
	var local: int = session.viewer_colony()
	var tick: int = result.tick
	if tick + 1 == state.defs.protection_ticks:
		journal.add_entry(tick, _t("JOURNAL_PROTECTION"))
	if local >= 0:
		# En spectateur (local à −1), pas d'alertes : seules les éliminations sont notées.
		_record_attacks(journal, result, state, local, last_alert, alert_ticks)
		_record_losses(journal, result, local)
	for i: int in range(0, result.tier_changes.size(), 3):
		var tier: int = result.tier_changes[i + 2]
		if result.tier_changes[i] != local or tier <= result.tier_changes[i + 1]:
			continue
		if state.colonies[local].tier_ticks[tier - 1] != tick:
			continue
		var lot: int = ColonyStats.tier_enzymes(state.defs, state.colonies[local], tier)
		journal.add_entry(tick, _t("JOURNAL_TIER") % [tier, NumberFormat.amount(lot)])
	for i: int in range(0, result.eliminations.size(), 2):
		var victim: String = GameText.colony_name(result.eliminations[i], local)
		var killer: String = GameText.colony_name(result.eliminations[i + 1], local)
		var alert: bool = result.eliminations[i] == local
		journal.add_entry(tick, _t("JOURNAL_ELIMINATED") % [killer, victim], alert)


## Une alerte quand une autre colonie touche une de mes cases (au plus une par colonie toutes
## les « alert_ticks » secondes).
static func _record_attacks(
	journal: JournalCard,
	result: TickResult,
	state: GameState,
	local: int,
	last_alert: Dictionary[int, int],
	alert_ticks: int
) -> void:
	for i: int in range(0, result.shots.size(), 2):
		var shooter: int = result.shots[i]
		var cell: int = result.shots[i + 1]
		if shooter == local or state.owner[cell] != local:
			continue
		if result.tick - last_alert.get(shooter, -alert_ticks) < alert_ticks:
			continue
		last_alert[shooter] = result.tick
		var name: String = GameText.colony_name(shooter, local)
		journal.add_entry(result.tick, _t("JOURNAL_ATTACK") % name, true)


## Cases prises par une autre colonie (les cases coupées comptent avec la prise).
static func _record_losses(journal: JournalCard, result: TickResult, local: int) -> void:
	var lost: Dictionary[int, int] = {}
	var cut: int = 0
	for i: int in range(0, result.captures.size(), 3):
		if result.captures[i + 2] == local:
			lost[result.captures[i]] = lost.get(result.captures[i], 0) + 1
	for i: int in range(0, result.cells_lost.size(), 2):
		if result.cells_lost[i] == local:
			cut += 1
	for taker: int in lost:
		var count: int = lost[taker] + cut
		cut = 0
		var name: String = GameText.colony_name(taker, local)
		journal.add_entry(result.tick, _t("JOURNAL_LOST") % [name, count], true)


static func _t(key: String) -> String:
	return TranslationServer.translate(key)
