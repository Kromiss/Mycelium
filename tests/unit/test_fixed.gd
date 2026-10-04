extends GutTest
## Tests du calcul en virgule fixe.


func test_mul_rounds_to_nearest() -> void:
	assert_eq(Fixed.mul(3333, 1500), 5000)
	assert_eq(Fixed.mul(1000, 1020), 1020)
	assert_eq(Fixed.mul(1, 500), 1)
	assert_eq(Fixed.mul(1, 499), 0)
	assert_eq(Fixed.mul(-1, 500), -1)


func test_div_round() -> void:
	assert_eq(Fixed.div_round(4800, 1000), 5)
	assert_eq(Fixed.div_round(7600, 1000), 8)
	assert_eq(Fixed.div_round(4400, 1000), 4)
	assert_eq(Fixed.div_round(-7, 2), -4)


func test_pow_table_matches_powers() -> void:
	var table: PackedInt64Array = Fixed.pow_table(1020, 200)
	assert_eq(table.size(), 200)
	assert_eq(table[0], 1000)
	assert_eq(table[1], 1020)
	assert_eq(table[2], 1040)
	# 1,02 ^ 100 ≈ 7,2446
	assert_eq(table[100], 7245)


func test_pow_table_is_capped() -> void:
	var table: PackedInt64Array = Fixed.pow_table(2000, 100)
	assert_eq(table[99], Fixed.POW_CAP)
	for value: int in table:
		assert_gt(value, 0)


func test_from_units() -> void:
	assert_eq(Fixed.from_units(30), 30_000)
