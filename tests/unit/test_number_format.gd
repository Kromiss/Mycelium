extends GutTest
## Écriture des grands nombres et des multiplicateurs pour le joueur.

var _locale: String


func before_each() -> void:
	_locale = TranslationServer.get_locale()
	TranslationServer.set_locale("en")


func after_each() -> void:
	TranslationServer.set_locale(_locale)


func test_amounts_use_suffixes() -> void:
	assert_eq(NumberFormat.amount(180_000), "180")
	assert_eq(NumberFormat.amount(1_234_000), "1.23 K")
	assert_eq(NumberFormat.amount(45_600_000), "45.6 K")
	assert_eq(NumberFormat.amount(636_000_000), "636 K")
	assert_eq(NumberFormat.amount(2_500_000_000), "2.50 M")
	assert_eq(NumberFormat.amount(7_000_000_000_000_000), "7.00 T")


func test_rates_keep_a_decimal_when_small() -> void:
	assert_eq(NumberFormat.rate(10_998), "11.0")
	assert_eq(NumberFormat.rate(150_000), "150")
	assert_eq(NumberFormat.rate(4_920_000), "4.92 K")


func test_multipliers_drop_useless_zeros() -> void:
	assert_eq(NumberFormat.multiplier(2000), "×2")
	assert_eq(NumberFormat.multiplier(1020), "×1.02")
	assert_eq(NumberFormat.multiplier(1400), "×1.4")
	assert_eq(NumberFormat.decimal(3333), "3.333")
	assert_eq(NumberFormat.decimal(30_000), "30")


func test_french_uses_a_decimal_comma() -> void:
	TranslationServer.set_locale("fr")
	assert_eq(NumberFormat.amount(1_234_000), "1,23 K")
	assert_eq(NumberFormat.multiplier(1400), "×1,4")


func test_clock() -> void:
	assert_eq(NumberFormat.clock(0), "00:00")
	assert_eq(NumberFormat.clock(754), "12:34")
	assert_eq(NumberFormat.clock(1800), "30:00")
