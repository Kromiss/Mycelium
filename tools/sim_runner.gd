class_name SimRunner
extends RefCounted
## Lots de parties simulées pour le panneau de simulations (GDD §18.5, Architecture §11.3) :
## un lancement simple (N parties par composition de forêt) ou un balayage (une valeur de
## réglage, de son minimum à son maximum par pas ; une série par valeur et par composition).
## Les parties tournent en parallèle sur les fils de travail de Godot ; les tests peuvent les
## jouer à la suite.


## Une série : une composition de forêt (profil du robot de chaque secteur) et des réglages
## (la valeur balayée, s'il y en a une).
class Series:
	extends RefCounted
	var profiles: Array[StringName] = []
	var defs: SimDefs
	## Valeur balayée (affichée), si le lot est un balayage.
	var sweep_value: float = 0.0
	var has_sweep: bool = false
	## Mesures des parties de la série, dans l'ordre des graines.
	var results: Array[SimRunResult] = []

	## Nom de la série : « Canonnier · Conquérant » ou « Canonnier · Conquérant · 25 ».
	func label() -> String:
		var name: String = SimRunner.composition_label(profiles)
		if not has_sweep:
			return name
		return "%s · %s" % [name, NumberFormat.decimal(roundi(sweep_value * Fixed.ONE))]

	## Secteurs occupés, dans l'ordre (une colonne de mesures par secteur).
	func sectors() -> PackedInt32Array:
		return SimRun.occupied_sectors(profiles)

	## Nom de la colonne d'un secteur : « S2 · Conquérant ».
	func sector_label(sector: int) -> String:
		var name: String = RobotCatalog.label(profiles[sector])
		return TranslationServer.translate("SIM_SECTOR_SHORT") % [sector + 1, name]


## Nombre maximal de valeurs d'un balayage.
const MAX_SWEEP_VALUES: int = 200

var series: Array[Series] = []
## Nombre de parties par série, graine de la première partie et durée simulée (secondes).
var runs: int = 1
var base_seed: int = 0
var duration_ticks: int = 1800

var _mutex := Mutex.new()
var _done: int = 0
var _task: int = -1


## Nom d'une composition : profils des secteurs occupés, « — » pour un secteur vide.
static func composition_label(profiles: Array[StringName]) -> String:
	var names := PackedStringArray()
	for id: StringName in profiles:
		names.append(RobotCatalog.label(id) if id != &"" else "—")
	return " · ".join(names)


## Prépare un lot : compositions, réglages, et éventuellement un balayage (« sweep » non nul,
## de « low » à « high » par « step »). Les compositions sans robot sont ignorées.
func setup(
	defs: SimDefs,
	compositions: Array[Array],
	run_count: int,
	first_seed: int,
	duration: int,
	sweep: SandboxParam = null,
	low: float = 0.0,
	high: float = 0.0,
	step: float = 1.0
) -> void:
	runs = maxi(1, run_count)
	base_seed = first_seed
	duration_ticks = duration
	series.clear()
	var values := PackedFloat64Array([0.0])
	if sweep != null:
		values = sweep_values(low, high, step)
	for value: float in values:
		for composition: Array in compositions:
			var profiles: Array[StringName] = []
			for id: Variant in composition:
				profiles.append(StringName(str(id)))
			if SimRun.occupied_sectors(profiles).is_empty():
				continue
			var one := Series.new()
			one.profiles = profiles
			one.defs = defs.duplicate_defs()
			if sweep != null:
				sweep.write(one.defs, value)
				one.sweep_value = value
				one.has_sweep = true
			series.append(one)
	for one: Series in series:
		one.results.resize(runs)


## Valeurs d'un balayage, du minimum au maximum compris, par pas (au plus 200 valeurs).
static func sweep_values(low: float, high: float, step: float) -> PackedFloat64Array:
	var values := PackedFloat64Array()
	if step <= 0.0 or high < low:
		values.append(low)
		return values
	var count: int = mini(MAX_SWEEP_VALUES, floori((high - low) / step + 0.000001) + 1)
	for i: int in range(count):
		values.append(low + step * i)
	return values


## Nombre total de parties du lot.
func job_count() -> int:
	return series.size() * runs


## Graine de la partie numéro « run » (0 à runs − 1) d'une série.
func run_seed(run: int) -> int:
	return base_seed + run


## Lance le lot sur les fils de travail.
func start() -> void:
	_done = 0
	_task = WorkerThreadPool.add_group_task(_run_job, job_count(), -1, false, "Simulations")


## Joue tout le lot à la suite, sans fil de travail (tests).
func run_all() -> void:
	_done = 0
	for job: int in range(job_count()):
		_run_job(job)


## Avancement (0 à 1).
func progress() -> float:
	_mutex.lock()
	var done: int = _done
	_mutex.unlock()
	return float(done) / float(maxi(1, job_count()))


## Vrai quand toutes les parties sont jouées (le lot est alors terminé proprement).
func is_finished() -> bool:
	if _task < 0:
		return progress() >= 1.0
	if not WorkerThreadPool.is_group_task_completed(_task):
		return false
	WorkerThreadPool.wait_for_group_task_completion(_task)
	_task = -1
	return true


## Joue la partie numéro « job » : série = job ÷ runs, graine = première graine + job % runs.
func _run_job(job: int) -> void:
	@warning_ignore("integer_division")
	var one: Series = series[job / runs]
	var index: int = job % runs
	var run := SimRun.new(one.defs, run_seed(index), one.profiles, duration_ticks)
	var result: SimRunResult = run.run()
	result.sweep_value = one.sweep_value
	_mutex.lock()
	one.results[index] = result
	_done += 1
	_mutex.unlock()
