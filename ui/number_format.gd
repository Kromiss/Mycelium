class_name NumberFormat
extends RefCounted
## Écriture des grands nombres pour le joueur (GDD §6.4) : suffixes K, M, B, T et virgule
## décimale en français. Les quantités arrivent en millièmes, comme dans la simulation.

const SUFFIXES: Array[String] = ["", "K", "M", "B", "T"]


## Quantité de nutriments (millièmes) : « 180 », « 1,23 K », « 45,6 M ».
static func amount(milli: int) -> String:
	return _format(float(milli) / Fixed.ONE, false)


## Débit (millièmes par seconde) : « 11,0 », « 2,45 K » ; une décimale sous 100.
static func rate(milli_per_second: int) -> String:
	return _format(float(milli_per_second) / Fixed.ONE, true)


## Multiplicateur en pour-mille : « ×1,4 », « ×2 ».
static func multiplier(per_mille: int) -> String:
	return "×" + decimal(per_mille)


## Millièmes (ou pour-mille) écrits avec trois décimales au plus, sans zéro inutile :
## « 3,333 », « 1,02 », « 30 ».
static func decimal(milli: int) -> String:
	@warning_ignore("integer_division")
	var whole: int = absi(milli) / Fixed.ONE
	var fraction: int = absi(milli) % Fixed.ONE
	var text: String = str(whole)
	if fraction != 0:
		text += "." + ("%03d" % fraction).rstrip("0")
	if milli < 0:
		text = "-" + text
	return _localize(text)


## Durée en secondes : « 12:34 ».
static func clock(seconds: int) -> String:
	@warning_ignore("integer_division")
	return "%02d:%02d" % [seconds / 60, seconds % 60]


static func _format(value: float, small_decimal: bool) -> String:
	var magnitude: int = 0
	var scaled: float = value
	while absf(scaled) >= 1000.0 and magnitude < SUFFIXES.size() - 1:
		scaled /= 1000.0
		magnitude += 1
	var text: String
	if magnitude == 0:
		if small_decimal and absf(scaled) < 100.0:
			text = "%.1f" % scaled
		else:
			text = "%d" % floori(scaled)
	elif absf(scaled) < 10.0:
		text = "%.2f" % scaled
	elif absf(scaled) < 100.0:
		text = "%.1f" % scaled
	else:
		text = "%d" % floori(scaled)
	text = _localize(text)
	if magnitude == 0:
		return text
	return "%s %s" % [text, SUFFIXES[magnitude]]


## Virgule décimale en français.
static func _localize(text: String) -> String:
	if TranslationServer.get_locale().begins_with("fr"):
		return text.replace(".", ",")
	return text
