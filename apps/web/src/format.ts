/** Big-number and duration formatting for the HUD (GDD §10: suffixes, then scientific notation). */

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No"];

/**
 * 0 → "0", 12.345 → "12.3", 1234 → "1.23K", 5.6e9 → "5.6B", 1e36 → "1e36".
 * Three significant digits past 1 000; `locale` controls the decimal separator.
 */
export function formatNumber(value: number, locale = "en-US"): string {
  if (!Number.isFinite(value)) return "∞";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs < 1000) {
    const digits = abs < 10 ? 2 : abs < 100 ? 1 : 0;
    return sign + trim(abs, digits, locale);
  }
  let tier = Math.floor(Math.log10(abs) / 3);
  let scaled = abs / Math.pow(1000, tier);
  // Rounding can push 999.95K up to "1000K": move to the next tier.
  if (round3(scaled) >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  if (tier < SUFFIXES.length) {
    const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    return sign + trim(scaled, digits, locale) + SUFFIXES[tier];
  }
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, exp);
  return `${sign}${trim(mantissa, 2, locale)}e${exp}`;
}

function round3(x: number): number {
  const digits = x < 10 ? 2 : x < 100 ? 1 : 0;
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function trim(x: number, maxDigits: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: maxDigits, useGrouping: false }).format(x);
}

/** 42_000 → "42s", 95_000 → "1m 35s", 3_700_000 → "1h 01m". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
