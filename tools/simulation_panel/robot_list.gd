class_name RobotList
extends VBoxContainer
## Liste des robots du panneau de simulations (GDD §14.5, G2) : chaque ligne compose un robot
## (profil d'expansion, profil de bâtisseur, part de l'expansion en %) ; on en ajoute et on en
## retire. La liste est gardée d'une session à l'autre dans un fichier de l'utilisateur.

## La liste a changé.
signal changed

const PATH: String = "user://simulation_robots.cfg"
const SECTION: String = "robots"

var _specs: Array[RobotSpec] = []
var _rows: VBoxContainer
var _path: String = PATH


func _ready() -> void:
	add_theme_constant_override(&"separation", 8)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override(&"separation", 6)
	add_child(_rows)
	var add := Button.new()
	add.text = "SIM_ADD_ROBOT"
	add.theme_type_variation = &"SmallButton"
	add.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	add.pressed.connect(_on_add)
	add_child(add)
	_rebuild()


## Lit la liste enregistrée (ou celle du premier lancement). « path » : fichier (tests).
func load_list(path: String = PATH) -> void:
	_path = path
	_specs = read_file(path)
	if is_node_ready():
		_rebuild()


## Robots de la liste (copies).
func specs() -> Array[RobotSpec]:
	var copies: Array[RobotSpec] = []
	for spec: RobotSpec in _specs:
		copies.append(spec.duplicate_spec())
	return copies


## Liste enregistrée dans un fichier ; la liste du premier lancement s'il n'existe pas ou est
## illisible.
static func read_file(path: String) -> Array[RobotSpec]:
	var file := ConfigFile.new()
	if file.load(path) != OK or not file.has_section_key(SECTION, "list"):
		return RobotSpec.default_list()
	var saved: Variant = file.get_value(SECTION, "list", [])
	var list: Array[RobotSpec] = []
	if saved is Array:
		var entries: Array = saved
		for entry: Variant in entries:
			if entry is Dictionary:
				var data: Dictionary = entry
				list.append(RobotSpec.from_dict(data))
	return list


## Enregistre une liste dans un fichier.
static func write_file(path: String, list: Array[RobotSpec]) -> Error:
	var entries: Array = []
	for spec: RobotSpec in list:
		entries.append(spec.to_dict())
	var file := ConfigFile.new()
	file.set_value(SECTION, "list", entries)
	return file.save(path)


func _save() -> void:
	write_file(_path, _specs)
	changed.emit()


func _rebuild() -> void:
	if _rows == null:
		return
	for child: Node in _rows.get_children():
		child.queue_free()
	for index: int in range(_specs.size()):
		_rows.add_child(_row(index))


func _row(index: int) -> HBoxContainer:
	var spec: RobotSpec = _specs[index]
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 8)
	var expansion := OptionButton.new()
	for key: String in EconomyRobot.PROFILE_KEYS:
		expansion.add_item(tr(key))
	expansion.select(spec.expansion)
	expansion.item_selected.connect(
		func(selected: int) -> void:
			spec.expansion = selected as EconomyRobot.Profile
			_save()
	)
	row.add_child(expansion)
	var builder := OptionButton.new()
	for key: String in BuilderRobot.PROFILE_KEYS:
		builder.add_item(tr(key))
	builder.select(spec.builder)
	builder.item_selected.connect(
		func(selected: int) -> void:
			spec.builder = selected as BuilderRobot.Profile
			_save()
	)
	row.add_child(builder)
	var share := SpinBox.new()
	share.min_value = 0.0
	share.max_value = 100.0
	share.step = 1.0
	share.suffix = "%"
	share.value = spec.expansion_share
	share.tooltip_text = "SIM_ROBOT_SHARE"
	share.custom_minimum_size = Vector2(120.0, 0.0)
	share.value_changed.connect(
		func(value: float) -> void:
			spec.expansion_share = roundi(value)
			_save()
	)
	row.add_child(share)
	var remove := Button.new()
	remove.text = "SIM_REMOVE_ROBOT"
	remove.theme_type_variation = &"SmallButton"
	remove.pressed.connect(func() -> void: _remove(spec))
	row.add_child(remove)
	return row


func _on_add() -> void:
	_specs.append(
		RobotSpec.make(
			EconomyRobot.Profile.PROFITABLE, BuilderRobot.Profile.PRODUCER, RobotSpec.DEFAULT_SHARE
		)
	)
	_rebuild()
	_save()


func _remove(spec: RobotSpec) -> void:
	_specs.erase(spec)
	_rebuild()
	_save()
