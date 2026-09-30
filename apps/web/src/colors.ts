import type { ColorId } from "@mycelium/shared";

/** Colours of other players on the map and in the leaderboard (by slice, so neighbours differ). */
export function playerColor(index: number): number {
  // Golden-angle hue steps: consecutive slices get far-apart hues.
  const hue = (index * 137.508 + 20) % 360;
  return hslToRgb(hue / 360, 0.62, 0.58);
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function hslToRgb(h: number, s: number, l: number): number {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const x = (t + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const [r, g, b] = [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((c) => Math.round(c * 255)) as [number, number, number];
  return (r << 16) | (g << 8) | b;
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
