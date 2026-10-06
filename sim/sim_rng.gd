class_name SimRng
extends RefCounted
## Aléatoire à graine, propre à la simulation (Architecture §4.4).
## Générateur xorshift32 : uniquement des décalages, des « ou exclusif » et des produits qui
## tiennent dans un entier 64 bits, donc un résultat identique sur toutes les machines.
## Jamais de randf(), randi() ni randomize() dans sim/ : tout l'aléatoire passe par ici.

const MASK_32: int = 0xFFFFFFFF
const _MIX_1: int = 0x85EBCA6B
const _MIX_2: int = 0xC2B2AE35
## Valeur de repli si le mélange de la graine donne zéro (état interdit pour xorshift).
const _NONZERO: int = 0x9E3779B9

var _state: int = _NONZERO


func _init(seed_value: int = 0) -> void:
	set_seed(seed_value)


## Réinitialise le générateur à partir d'une graine (n'importe quel entier 64 bits).
func set_seed(seed_value: int) -> void:
	var folded: int = (seed_value ^ _shift_right(seed_value, 32)) & MASK_32
	_state = _fmix32(folded)
	if _state == 0:
		_state = _NONZERO


## Prochain entier sur 32 bits, entre 0 et 2³² − 1.
func next_u32() -> int:
	var x: int = _state
	x ^= (x << 13) & MASK_32
	x ^= x >> 17
	x ^= (x << 5) & MASK_32
	_state = x
	return x


## Entier uniforme entre 0 et « bound » − 1 (sans biais : tirages rejetés au besoin).
func range_int(bound: int) -> int:
	assert(bound > 0 and bound <= MASK_32, "Borne hors limites.")
	var limit: int = (MASK_32 + 1) - ((MASK_32 + 1) % bound)
	var value: int = next_u32()
	while value >= limit:
		value = next_u32()
	return value % bound


## Entier uniforme entre « low » et « high » compris.
func range_between(low: int, high: int) -> int:
	assert(high >= low, "Intervalle vide.")
	return low + range_int(high - low + 1)


## Générateur indépendant dérivé de celui-ci (par exemple un par robot), sans changer
## l'état de celui-ci : même graine et même « salt » donnent toujours le même générateur.
func derive(salt: int) -> SimRng:
	var child := SimRng.new()
	child._state = _fmix32((_state ^ _fmix32(salt & MASK_32)) & MASK_32)
	if child._state == 0:
		child._state = _NONZERO
	return child


## État interne, pour l'empreinte de la partie.
func state() -> int:
	return _state


## Décalage à droite logique (sans propagation du signe) d'un entier 64 bits.
static func _shift_right(value: int, bits: int) -> int:
	return (value >> bits) & ((1 << (64 - bits)) - 1)


## Produit de deux entiers 32 bits, gardé sur 32 bits, sans dépasser un entier 64 bits.
static func _mul32(a: int, b: int) -> int:
	var low: int = a * (b & 0xFFFF)
	var high: int = ((a * (b >> 16)) & 0xFFFF) << 16
	return (low + high) & MASK_32


## Mélange final de MurmurHash3 : répartit les bits d'une graine sur tout l'entier.
static func _fmix32(value: int) -> int:
	var h: int = value & MASK_32
	h ^= h >> 16
	h = _mul32(h, _MIX_1)
	h ^= h >> 13
	h = _mul32(h, _MIX_2)
	h ^= h >> 16
	return h
