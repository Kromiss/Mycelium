class_name RobotSpec
extends RefCounted
## Composition d'un robot du panneau de simulations (GDD §14.5, G2) : un profil d'expansion, un
## profil de bâtisseur et le pourcentage de la production consacré à l'expansion (le reste va
## à la construction).

## Pourcentage d'expansion des robots ajoutés à la main (le reste à la construction).
const DEFAULT_SHARE: int = 70

var expansion: EconomyRobot.Profile = EconomyRobot.Profile.PROFITABLE
var builder: BuilderRobot.Profile = BuilderRobot.Profile.NONE
## Part de la production consacrée à l'expansion, en pour-cent (0 à 100).
var expansion_share: int = 100


static func make(
	expansion_profile: EconomyRobot.Profile, builder_profile: BuilderRobot.Profile, share: int
) -> RobotSpec:
	var spec := RobotSpec.new()
	spec.expansion = expansion_profile
	spec.builder = builder_profile
	spec.expansion_share = clampi(share, 0, 100)
	return spec


## Liste du premier lancement (décidée le 4 octobre 2026) : les 4 profils d'expansion sans
## bâtisseur à 100 %, puis Rentable avec chaque bâtisseur à 70 %.
static func default_list() -> Array[RobotSpec]:
	var list: Array[RobotSpec] = []
	for profile: int in EconomyRobot.Profile.values():
		list.append(make(profile as EconomyRobot.Profile, BuilderRobot.Profile.NONE, 100))
	for builder_profile: BuilderRobot.Profile in [
		BuilderRobot.Profile.PRODUCER, BuilderRobot.Profile.ACCELERATOR, BuilderRobot.Profile.RANDOM
	]:
		list.append(make(EconomyRobot.Profile.PROFITABLE, builder_profile, DEFAULT_SHARE))
	return list


func duplicate_spec() -> RobotSpec:
	return make(expansion, builder, expansion_share)


## Nom du robot : « Rentable », ou « Rentable · Producteur · 70 % » s'il construit.
func label() -> String:
	var name: String = TranslationServer.translate(EconomyRobot.PROFILE_KEYS[expansion])
	if builder == BuilderRobot.Profile.NONE and expansion_share == 100:
		return name
	var builder_name: String = TranslationServer.translate(BuilderRobot.PROFILE_KEYS[builder])
	return "%s · %s · %d %%" % [name, builder_name, expansion_share]


func to_dict() -> Dictionary:
	return {"expansion": expansion, "builder": builder, "expansion_share": expansion_share}


## Robot lu depuis un dictionnaire (fichier) ; les valeurs invalides gardent leur défaut.
static func from_dict(data: Dictionary) -> RobotSpec:
	var spec := RobotSpec.new()
	var expansion_value: int = DictRead.get_int(data, "expansion", spec.expansion)
	if expansion_value in EconomyRobot.Profile.values():
		spec.expansion = expansion_value as EconomyRobot.Profile
	var builder_value: int = DictRead.get_int(data, "builder", spec.builder)
	if builder_value in BuilderRobot.Profile.values():
		spec.builder = builder_value as BuilderRobot.Profile
	spec.expansion_share = clampi(DictRead.get_int(data, "expansion_share", 100), 0, 100)
	return spec
