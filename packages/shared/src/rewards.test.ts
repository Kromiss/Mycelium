import { describe, expect, it } from "vitest";
import {
  careerRewards,
  efficiency,
  leagueAfter,
  leagueAfterAbsence,
  seasonRewards,
  secondaryBoard,
  type SeasonLine,
} from "./rewards";

const HOUR = 3_600_000;

const line = (id: string, o: Partial<SeasonLine> = {}): SeasonLine => ({
  playerId: id,
  biomass: 0,
  trophies: 0,
  tiles: 0,
  conquests: 0,
  boss: 0,
  activeMs: 0,
  fruitings: 0,
  ...o,
});

describe("leagues (GDD §8.3)", () => {
  it("promote the first 3 and relegate the last 3 of a forest of 12", () => {
    const after = Array.from({ length: 12 }, (_, i) => leagueAfter(2, i + 1, 12));
    expect(after).toEqual([3, 3, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1]);
  });

  it("stay between Bronze and Primordial", () => {
    expect(leagueAfter(4, 1, 12)).toBe(4);
    expect(leagueAfter(0, 12, 12)).toBe(0);
  });

  it("move at most half of a small forest each way", () => {
    expect(Array.from({ length: 4 }, (_, i) => leagueAfter(1, i + 1, 4))).toEqual([2, 2, 0, 0]);
    expect(Array.from({ length: 5 }, (_, i) => leagueAfter(1, i + 1, 5))).toEqual([2, 2, 1, 0, 0]);
    expect(leagueAfter(1, 1, 1)).toBe(1);
  });

  it("cost a league every two weeks away", () => {
    expect(leagueAfterAbsence(3, 0)).toBe(3);
    expect(leagueAfterAbsence(3, 1)).toBe(3);
    expect(leagueAfterAbsence(3, 2)).toBe(2);
    expect(leagueAfterAbsence(3, 5)).toBe(1);
    expect(leagueAfterAbsence(1, 10)).toBe(0);
  });
});

describe("secondary leaderboards (GDD §8.1)", () => {
  const lines = [
    line("a", { tiles: 40, conquests: 3, boss: 0, biomass: 9_000, activeMs: 3 * HOUR }),
    line("b", { tiles: 55, conquests: 0, boss: 500, biomass: 3_000, activeMs: 0.5 * HOUR }),
    line("c", { tiles: 20, conquests: 9, boss: 800, biomass: 4_000, activeMs: 1 * HOUR }),
  ];

  it("rank territory, conquests and world boss damage, leaving out zeros", () => {
    expect(secondaryBoard(lines, "territory").map((r) => r.playerId)).toEqual(["b", "a", "c"]);
    expect(secondaryBoard(lines, "conquests").map((r) => r.playerId)).toEqual(["c", "a"]);
    expect(secondaryBoard(lines, "boss").map((r) => [r.rank, r.playerId, r.value])).toEqual([
      [1, "c", 800],
      [2, "b", 500],
    ]);
  });

  it("rank efficiency as biomass per active hour, from one hour of play", () => {
    expect(efficiency(lines[1]!)).toBeNull();
    expect(secondaryBoard(lines, "efficiency").map((r) => [r.playerId, r.value])).toEqual([
      ["c", 4_000],
      ["a", 3_000],
    ]);
  });
});

describe("rewards (GDD §8.2)", () => {
  it("give titles to each winner, colours to the podium and the league reached", () => {
    const lines = [line("a", { tiles: 10, conquests: 2 }), line("b", { tiles: 30, boss: 5 }), line("c"), line("d")];
    const ranks = new Map([["a", 1], ["b", 2], ["c", 3], ["d", 4]]);
    const leagues = new Map([["a", 2], ["b", 1], ["c", 0], ["d", 0]]);
    const got = seasonRewards(lines, ranks, ["c", "d"], leagues);
    expect(got.get("a")).toEqual(
      expect.arrayContaining([
        { kind: "title", id: "champion" },
        { kind: "color", id: "gold" },
        { kind: "title", id: "gold" },
        { kind: "color", id: "amber" },
        { kind: "title", id: "conqueror" },
      ]),
    );
    expect(got.get("b")).toEqual(
      expect.arrayContaining([
        { kind: "color", id: "silver" },
        { kind: "title", id: "silver" },
        { kind: "title", id: "colossus" },
        { kind: "title", id: "treeEater" },
      ]),
    );
    expect(got.get("c")).toEqual([
      { kind: "color", id: "copper" },
      { kind: "title", id: "bronze" },
      { kind: "title", id: "allied" },
    ]);
    expect(got.get("d")).toEqual([
      { kind: "title", id: "bronze" },
      { kind: "title", id: "allied" },
    ]);
  });

  it("unlock skins with the career (no strain to unlock since M9)", () => {
    expect(careerRewards({ seasons: 1, fruitings: 0, trophies: 0 })).toEqual([]);
    expect(careerRewards({ seasons: 3, fruitings: 5, trophies: 24 })).toEqual([
      { kind: "skin", id: "morel" },
      { kind: "skin", id: "coprinus" },
    ]);
    expect(careerRewards({ seasons: 10, fruitings: 0, trophies: 25 }).map((r) => r.id)).toEqual(["coprinus", "clavaria", "amanita"]);
  });
});
