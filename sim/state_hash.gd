class_name StateHash
extends RefCounted
## Empreinte de l'état d'une partie (Architecture §4.2, §7) : deux états identiques donnent
## toujours la même empreinte. Sert aux tests de déterminisme, aux replays et, au G8, à la
## vérification de l'hôte par les invités.


## Empreinte de l'état, sur 63 bits (toujours positive).
static func compute(state: GameState) -> int:
	var context := HashingContext.new()
	var error: Error = context.start(HashingContext.HASH_SHA256)
	assert(error == OK, "Impossible de démarrer le calcul d'empreinte.")
	var header := PackedInt64Array(
		[
			state.tick,
			1 if state.finished else 0,
			state.game_seed,
			state.cell_count(),
			state.colonies.size(),
			state.rng.state(),
			state.start_colonies,
		]
	)
	_update(context, header.to_byte_array())
	_update(context, state.owner.to_byte_array())
	_update(context, state.hp.to_byte_array())
	_update(context, state.last_hitter.to_byte_array())
	_update(context, state.no_regen_until.to_byte_array())
	_update(context, state.cell_rank.to_byte_array())
	_update(context, state.ranking.to_byte_array())
	for colony: ColonyState in state.colonies:
		_update(context, colony.hash_values().to_byte_array())
	var digest: PackedByteArray = context.finish()
	return digest.decode_s64(0) & 0x7FFFFFFFFFFFFFFF


static func _update(context: HashingContext, bytes: PackedByteArray) -> void:
	if bytes.is_empty():
		return
	var error: Error = context.update(bytes)
	assert(error == OK, "Échec du calcul d'empreinte.")
