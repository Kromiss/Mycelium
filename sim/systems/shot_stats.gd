class_name ShotStats
extends RefCounted
## Chiffres de tir d'une colonie, calculés une fois par tick (ColonyStats) au lieu d'une fois
## par spore.

## Dégâts d'une spore sur une case libre et sur une case adverse, avant critique.
var damage_free: int = 0
var damage_enemy: int = 0
## Soin d'une spore.
var heal: int = 0
## Chance de critique (pour-mille) et multiplicateur des dégâts d'un critique.
var crit_pm: int = 0
var crit_damage_pm: int = 0
## Éclaboussure (pour-mille des dégâts) et Rebond (cases).
var splash_pm: int = 0
var bounce: int = 0
## Secondes sans régénération infligées aux cases touchées (Toxique).
var toxic_ticks: int = 0
## Multiplicateur des PV de mes cases et bonus de Cohésion par voisine (ColonyStats.cell_max_hp).
var hp_factor: int = 0
var cohesion_hp: int = 0


## Chiffres de tir actuels de la colonie.
static func of(defs: SimDefs, colony: ColonyState) -> ShotStats:
	var stats := ShotStats.new()
	var damage: int = ColonyStats.damage(defs, colony)
	stats.damage_free = Fixed.mul(
		damage, ColonyStats.mutation_product(defs, colony, &"free_damage_pm")
	)
	stats.damage_enemy = Fixed.mul(
		damage, ColonyStats.mutation_product(defs, colony, &"enemy_damage_pm")
	)
	stats.heal = ColonyStats.heal(defs, colony)
	stats.crit_pm = ColonyStats.crit_pm(defs, colony)
	stats.crit_damage_pm = defs.crit_damage_pm
	stats.splash_pm = ColonyStats.splash_pm(defs, colony)
	stats.bounce = ColonyStats.bounce(defs, colony)
	stats.toxic_ticks = ColonyStats.toxic_ticks(defs, colony)
	stats.hp_factor = ColonyStats.cell_hp_factor(defs, colony)
	stats.cohesion_hp = Fixed.mul(
		defs.cohesion_hp_pm, ColonyStats.mutation_product(defs, colony, &"cohesion_pm")
	)
	return stats


## Dégâts d'une spore sur une case donnée (libre ou adverse), avant critique.
func damage_on(state: GameState, cell: int) -> int:
	return damage_free if state.owner[cell] < 0 else damage_enemy
