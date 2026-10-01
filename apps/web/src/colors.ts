import type { ColorId } from "@mycelium/shared";

/**
 * The 12 colony colours of the "Pastille ronde" art direction (GDD §11, M9): a main shade for the colony
 * and a dark one for its Cœur and rings, in the order they go around the forest, so that two neighbours
 * stay very different (colour blindness included).
 */
export const PALETTE: ReadonlyArray<{ name: string; main: number; dark: number }> = [
  { name: "mint", main: 0x5acea8, dark: 0x379f7d },
  { name: "indigo", main: 0x4042d4, dark: 0x2a2b99 },
  { name: "raspberry", main: 0xe0516c, dark: 0xb62a44 },
  { name: "lavender", main: 0x8f7cf2, dark: 0x563be1 },
  { name: "lemon", main: 0xe7df39, dark: 0xb0a91e },
  { name: "lagoon", main: 0x3ea8a7, dark: 0x2b6968 },
  { name: "apple", main: 0x6fbc46, dark: 0x4d7d33 },
  { name: "candy", main: 0xf691c3, dark: 0xe74e9a },
  { name: "apricot", main: 0xf5c983, dark: 0xe6a641 },
  { name: "sky", main: 0x78bcf1, dark: 0x3796e0 },
  { name: "coral", main: 0xf58c85, dark: 0xe64d43 },
  { name: "plum", main: 0xa35da8, dark: 0x6f4172 },
];

/** Colour of the colony of a slice (map, leaderboard, chat). */
export function playerColor(index: number): number {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!.main;
}

/** Dark shade of the colony of a slice: its Cœur, its rings. */
export function playerDark(index: number): number {
  return PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length]!.dark;
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Network colours won as rewards (M7): podium, then one per league. */
export const REWARD_COLORS: Record<ColorId, number> = {
  gold: 0xf2c94c,
  silver: 0xc9d1d9,
  copper: 0xd08a4e,
  moss: 0x7fbf5a,
  amber: 0xf0a030,
  ice: 0x8fd8f0,
  violet: 0xb58cf0,
};

/** A colony's colour: its reward colour if it shows one, else its slice colour. */
export function ownerColor(o: { color: number; rewardColor?: ColorId } | undefined): number {
  return o?.rewardColor ? REWARD_COLORS[o.rewardColor] : playerColor(o?.color ?? 0);
}

/** A colony's dark shade (its Cœur, rings). */
export function ownerDark(o: { color: number; rewardColor?: ColorId } | undefined): number {
  return o?.rewardColor ? mix(REWARD_COLORS[o.rewardColor], 0x000000, 0.3) : playerDark(o?.color ?? 0);
}

/** `a` moved toward `b` by `t` (0 to 1). */
export function mix(a: number, b: number, t: number): number {
  const c = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
