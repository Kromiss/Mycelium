class_name RobotCatalog
extends RefCounted
## Les profils de robot (GDD §2.5) : Canonnier, Bâtisseur et Conquérant, dans cet ordre.

const GUNNER: RobotProfile = preload("res://ai/profiles/gunner.tres")
const BUILDER: RobotProfile = preload("res://ai/profiles/builder.tres")
const CONQUEROR: RobotProfile = preload("res://ai/profiles/conqueror.tres")
## Clé de traduction de « aucun robot ».
const NONE_KEY: String = "ROBOT_NONE"


## Tous les profils, dans l'ordre d'affichage.
static func profiles() -> Array[RobotProfile]:
	var list: Array[RobotProfile] = [GUNNER, BUILDER, CONQUEROR]
	return list


## Profil d'un identifiant (null si inconnu ou vide).
static func find(id: StringName) -> RobotProfile:
	for profile: RobotProfile in profiles():
		if profile.id == id:
			return profile
	return null


## Nom traduit d'un profil (« Aucun » pour un identifiant vide ou inconnu).
static func label(id: StringName) -> String:
	var profile: RobotProfile = find(id)
	return TranslationServer.translate(profile.name_key if profile != null else NONE_KEY)
