extends GutTest
## Tests de l'aléatoire à graine de la simulation.


func test_same_seed_gives_same_sequence() -> void:
	var first := SimRng.new(42)
	var second := SimRng.new(42)
	for i: int in range(100):
		assert_eq(first.next_u32(), second.next_u32())


func test_different_seeds_give_different_sequences() -> void:
	var first := SimRng.new(1)
	var second := SimRng.new(2)
	var same: int = 0
	for i: int in range(50):
		if first.next_u32() == second.next_u32():
			same += 1
	assert_lt(same, 5)


func test_values_stay_on_32_bits() -> void:
	for seed_value: int in [0, 1, -1, 0x7FFFFFFFFFFFFFFF, -0x7FFFFFFFFFFFFFFF]:
		var rng := SimRng.new(seed_value)
		for i: int in range(200):
			var value: int = rng.next_u32()
			assert_true(value >= 0 and value <= SimRng.MASK_32, str(value))


func test_known_sequence_never_changes() -> void:
	# Garde-fou : si ces valeurs changent, les replays enregistrés ne rejouent plus pareil.
	var rng := SimRng.new(12345)
	assert_eq(rng.next_u32(), 1255823138)
	assert_eq(rng.next_u32(), 134017181)
	assert_eq(rng.next_u32(), 2752287018)


func test_range_int_stays_in_bounds_and_covers_values() -> void:
	var rng := SimRng.new(7)
	var seen: Dictionary[int, bool] = {}
	for i: int in range(600):
		var value: int = rng.range_int(6)
		assert_true(value >= 0 and value < 6)
		seen[value] = true
	assert_eq(seen.size(), 6)


func test_range_between() -> void:
	var rng := SimRng.new(9)
	for i: int in range(100):
		var value: int = rng.range_between(-3, 3)
		assert_true(value >= -3 and value <= 3)


func test_derive_is_reproducible_and_leaves_parent_untouched() -> void:
	var parent := SimRng.new(99)
	var before: int = parent.state()
	var child: SimRng = parent.derive(3)
	assert_eq(parent.state(), before)
	var again: SimRng = SimRng.new(99).derive(3)
	assert_eq(child.next_u32(), again.next_u32())
	var other: SimRng = SimRng.new(99).derive(4)
	assert_ne(SimRng.new(99).derive(3).next_u32(), other.next_u32())
