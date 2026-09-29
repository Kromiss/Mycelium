import { describe, expect, it } from "vitest";
import { formatDuration, formatNumber } from "./format";
import { interpolate, MESSAGES } from "./i18n";

describe("formatNumber", () => {
  it("keeps small numbers readable", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1.5)).toBe("1.5");
    expect(formatNumber(3.14159)).toBe("3.14");
    expect(formatNumber(12.345)).toBe("12.3");
    expect(formatNumber(999.4)).toBe("999");
  });

  it("uses suffixes from a thousand", () => {
    expect(formatNumber(1_000)).toBe("1K");
    expect(formatNumber(1_234)).toBe("1.23K");
    expect(formatNumber(56_780)).toBe("56.8K");
    expect(formatNumber(999_999)).toBe("1M");
    expect(formatNumber(5.6e9)).toBe("5.6B");
    expect(formatNumber(1e12)).toBe("1T");
    expect(formatNumber(4.2e32)).toBe("420No");
  });

  it("switches to scientific notation past the last suffix", () => {
    expect(formatNumber(1e33)).toBe("1e33");
    expect(formatNumber(2.345e40)).toBe("2.35e40");
  });

  it("follows the locale's decimal separator", () => {
    expect(formatNumber(1_234, "fr-FR")).toBe("1,23K");
    expect(formatNumber(3.5, "fr-FR")).toBe("3,5");
  });

  it("handles negatives and infinity", () => {
    expect(formatNumber(-1_500)).toBe("-1.5K");
    expect(formatNumber(Infinity)).toBe("∞");
  });
});

describe("formatDuration", () => {
  it("formats seconds, minutes and hours", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(42_000)).toBe("42s");
    expect(formatDuration(41_200)).toBe("42s");
    expect(formatDuration(95_000)).toBe("1m 35s");
    expect(formatDuration(3_700_000)).toBe("1h 01m");
  });
});

describe("i18n", () => {
  it("has the same keys and placeholders in every language", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(MESSAGES.en) as (keyof typeof MESSAGES.en)[]) {
      expect(MESSAGES.fr[key], key).toBeTruthy();
      expect(placeholders(MESSAGES.fr[key]), key).toEqual(placeholders(MESSAGES.en[key]));
    }
    expect(Object.keys(MESSAGES.fr).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });

  it("interpolates parameters", () => {
    expect(interpolate("{a} and {b}", { a: 1, b: "x" })).toBe("1 and x");
    expect(interpolate("{missing}", {})).toBe("{missing}");
  });
});
