class_name Fixed
extends RefCounted
## Calcul en entiers à virgule fixe, pour une simulation déterministe (Architecture §4.4).
## Les quantités sont en millièmes (12,5 nutriments = 12500) et les multiplicateurs en
## pour-mille (×1,12 = 1120). Les arrondis se font toujours au plus proche, la moitié
## s'arrondissant en s'éloignant de zéro.

## Une unité en millièmes, ou ×1 en pour-mille.
const ONE: int = 1000
## Plafond des tables de puissances, pour que les produits restent loin de la limite
## d'un entier 64 bits (~9,2e18), même multipliés par un coût ou une production.
const POW_CAP: int = 1_000_000_000_000


## Produit d'une valeur par un multiplicateur en pour-mille, arrondi au plus proche.
static func mul(value: int, per_mille: int) -> int:
	var product: int = value * per_mille
	if product >= 0:
		# Cas le plus fréquent, calculé sur place (même résultat que div_round()).
		@warning_ignore("integer_division")
		return (2 * product + ONE) / (2 * ONE)
	return div_round(product, ONE)


## Division entière arrondie au plus proche (la moitié s'éloigne de zéro).
static func div_round(numerator: int, denominator: int) -> int:
	assert(denominator != 0, "Division par zéro.")
	var negative: bool = (numerator < 0) != (denominator < 0)
	var n: int = absi(numerator)
	var d: int = absi(denominator)
	@warning_ignore("integer_division")
	var result: int = (2 * n + d) / (2 * d)
	return -result if negative else result


## Table des puissances d'un multiplicateur en pour-mille : table[k] = base ^ k, en pour-mille.
## Le calcul passe par des millionièmes pour ne pas accumuler les erreurs d'arrondi ;
## les valeurs sont plafonnées à POW_CAP.
static func pow_table(base_per_mille: int, size: int) -> PackedInt64Array:
	var table := PackedInt64Array()
	table.resize(size)
	var precise: int = ONE * ONE
	for k: int in range(size):
		table[k] = mini(div_round(precise, ONE), POW_CAP)
		if precise < POW_CAP * ONE:
			precise = div_round(precise * base_per_mille, ONE)
	return table


## Conversion d'un nombre de nutriments entiers en millièmes.
static func from_units(units: int) -> int:
	return units * ONE
