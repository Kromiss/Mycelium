class_name CompositionList
extends VBoxContainer
## Compositions de forêt du panneau de simulations (GDD §18.5) : chaque ligne donne le profil
## du robot de chaque secteur (ou aucun) ; chaque composition est une série de parties. On en
## ajoute et on en retire. Une liste par forêt (Duel, FFA), gardée d'une session à l'autre dans
## un fichier de l'utilisateur.

## La liste a changé.
signal changed

const PATH: String = "user://simulation_compositions.cfg"
const KEY: String = "list"

var _lists: Dictionary[StringName, Array] = {}
var _mode: StringName = &"duel"
var _sectors: int = 2
var _rows: VBoxContainer
var _path: String = PATH


func _ready() -> void:
	add_theme_constant_override(&"separation", 8)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override(&"separation", 6)
	add_child(_rows)
	var add := Button.new()
	add.text = "SIM_ADD_COMPOSITION"
	add.theme_type_variation = &"SmallButton"
	add.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	add.pressed.connect(_on_add)
	add_child(add)
	_rebuild()


## Lit les listes enregistrées. « path » : fichier (les tests en donnent un autre).
func load_lists(path: String = PATH) -> void:
	_path = path
	_lists.clear()
	var file := ConfigFile.new()
	if file.load(path) == OK:
		for section: String in file.get_sections():
			var saved: Variant = file.get_value(section, KEY, [])
			if saved is Array:
				_lists[StringName(section)] = saved
	if is_node_ready():
		_rebuild()


## Montre la liste d'une forêt (« sectors » : nombre de secteurs).
func set_forest(mode: StringName, sectors: int) -> void:
	_mode = mode
	_sectors = sectors
	if is_node_ready():
		_rebuild()


## Compositions de la forêt affichée (chacune : un profil par secteur, &"" pour aucun).
func compositions() -> Array[Array]:
	var result: Array[Array] = []
	for entry: Array in _list():
		result.append(_fit(entry))
	return result


## Liste du premier lancement : en Duel, chaque paire de profils ; en FFA, les trois profils
## deux fois.
static func default_list(sectors: int) -> Array:
	var ids: Array[StringName] = []
	for profile: RobotProfile in RobotCatalog.profiles():
		ids.append(profile.id)
	var list: Array = []
	if sectors == 2:
		for first: int in range(ids.size()):
			for second: int in range(first + 1, ids.size()):
				list.append([ids[first], ids[second]])
		return list
	var composition: Array = []
	for sector: int in range(sectors):
		composition.append(ids[sector % ids.size()])
	list.append(composition)
	return list


func _list() -> Array:
	if not _lists.has(_mode):
		_lists[_mode] = default_list(_sectors)
	return _lists[_mode]


## Composition ramenée au nombre de secteurs (secteurs vides ajoutés).
func _fit(entry: Array) -> Array[StringName]:
	var result: Array[StringName] = []
	for sector: int in range(_sectors):
		var id: StringName = StringName(str(entry[sector])) if sector < entry.size() else &""
		result.append(id if RobotCatalog.find(id) != null else &"")
	return result


func _save() -> void:
	var file := ConfigFile.new()
	for mode: StringName in _lists:
		var entries: Array = []
		for entry: Array in _lists[mode]:
			var names: Array = []
			for id: Variant in entry:
				names.append(str(id))
			entries.append(names)
		file.set_value(String(mode), KEY, entries)
	file.save(_path)
	changed.emit()


func _rebuild() -> void:
	if _rows == null:
		return
	for child: Node in _rows.get_children():
		child.queue_free()
	var list: Array = _list()
	for index: int in range(list.size()):
		var saved: Array = list[index]
		var entry: Array = _fit(saved)
		list[index] = entry
		_rows.add_child(_row(entry))


func _row(entry: Array) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 8)
	var ids: Array[StringName] = [&""]
	for profile: RobotProfile in RobotCatalog.profiles():
		ids.append(profile.id)
	for sector: int in range(_sectors):
		var option := OptionButton.new()
		option.tooltip_text = tr("SANDBOX_SECTOR") % (sector + 1)
		for id: StringName in ids:
			option.add_item(RobotCatalog.label(id))
		option.select(maxi(0, ids.find(StringName(str(entry[sector])))))
		option.item_selected.connect(
			func(selected: int) -> void:
				entry[sector] = ids[selected]
				_save()
		)
		row.add_child(option)
	var remove := Button.new()
	remove.text = "SIM_REMOVE_COMPOSITION"
	remove.theme_type_variation = &"SmallButton"
	remove.pressed.connect(func() -> void: _remove(entry))
	row.add_child(remove)
	return row


func _on_add() -> void:
	var first: Array = default_list(_sectors)[0]
	_list().append(first.duplicate())
	_rebuild()
	_save()


func _remove(entry: Array) -> void:
	_list().erase(entry)
	_rebuild()
	_save()
