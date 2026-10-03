extends GutTest
## Chaque écran se charge et s'instancie sans erreur.

const SCENES: Array[String] = [
	"res://ui/menus/main_menu.tscn",
	"res://ui/settings/settings_screen.tscn",
	"res://game/forest_screen.tscn",
	"res://view/map/forest_view.tscn",
]


func test_every_scene_instantiates() -> void:
	for path: String in SCENES:
		var scene: PackedScene = load(path)
		assert_not_null(scene, path)
		var node: Node = scene.instantiate()
		add_child_autofree(node)
		assert_true(node.is_inside_tree(), path)


func test_forest_screen_shows_the_whole_forest() -> void:
	SceneRouter.current_mode = SceneRouter.MODES[&"ffa"]
	var scene: PackedScene = load("res://game/forest_screen.tscn")
	var screen: Node = scene.instantiate()
	add_child_autofree(screen)
	var view: ForestView = screen.get_node("%ForestView")
	var camera: MapCamera = screen.get_node("%MapCamera")
	var bounds: Rect2 = view.bounds()
	assert_gt(bounds.size.x, 0.0)
	assert_almost_eq(camera.position, bounds.get_center(), Vector2(0.01, 0.01))


func test_both_palettes_build_a_theme() -> void:
	for palette: Palette in [Settings.LIGHT_PALETTE, Settings.DARK_PALETTE]:
		var theme: Theme = ThemeFactory.build(palette)
		assert_not_null(theme.default_font)
		assert_true(theme.has_stylebox(&"normal", &"Button"))
