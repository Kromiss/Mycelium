class_name SimRunner
extends RefCounted
## Lots de parties simulées pour le panneau de simulations (GDD §14.5, Architecture §11.3) :
## un lancement simple (N parties par robot de la liste) ou un balayage (une valeur de réglage,
## ou la part d'expansion des robots, de son minimum à son maximum par pas ; une série par valeur
## et par robot). Les parties tournent
## en parallèle sur les fils de travail de Godot ; les tests peuvent les jouer à la suite.


## Une série : un robot et des réglages (la valeur balayée, s'il y en a une).
class Series:
	extends RefCounted
	var spec: RobotSpec
	var defs: SimDefs
	## Valeur balayée (affichée), si le lot est un balayage.
	var sweep_value: float = 0.0
	var has_sweep: bool = false
	## Mesures des parties de la série, dans l'ordre des graines.
	var results: Array[SimRunResult] = []

	## Nom de la série : « Rentable » ou « Rentable · 25 ».
	func label() -> String:
		var name: String = spec.label()
		if not has_sweep:
			return name
		return "%s · %s" % [name, NumberFormat.decimal(roundi(sweep_value * Fixed.ONE))]


var series: Array[Series] = []
## Nombre de parties par série, graine de la première partie et durée simulée (secondes).
var runs: int = 1
var base_seed: int = 0
var duration_ticks: int = 1800

var _mutex := Mutex.new()
var _done: int = 0
var _task: int = -1
var _sweep: SandboxParam


## Prépare un lot : robots de la liste, réglages, et éventuellement un balayage (« sweep » non
## nul, de « low » à « high » par « step »).
func setup(
	defs: SimDefs,
	specs: Array[RobotSpec],
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
	_sweep = sweep
	series.clear()
	var values := PackedFloat64Array([0.0])
	if sweep != null:
		values = sweep_values(low, high, step)
	for value: float in values:
		for spec: RobotSpec in specs:
			var one := Series.new()
			one.spec = spec.duplicate_spec()
			one.defs = defs.duplicate_defs()
			if sweep != null:
				if sweep.group == SandboxParam.Group.ROBOT_SHARE:
					one.spec.expansion_share = clampi(roundi(value), 0, 100)
				else:
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
	var count: int = mini(200, floori((high - low) / step + 0.000001) + 1)
	for i: int in range(count):
		values.append(low + step * i)
	return values


## Nombre total de parties du lot.
func job_count() -> int:
	return series.size() * runs


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
	var run := SimRun.new(one.defs, base_seed + index, one.spec, duration_ticks)
	var result: SimRunResult = run.run()
	result.sweep_value = one.sweep_value
	_mutex.lock()
	one.results[index] = result
	_done += 1
	_mutex.unlock()
