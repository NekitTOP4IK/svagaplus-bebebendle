import { describe, it, expect } from "vitest";
import {
  likesPct,
  deltaPp,
  roundPotentialPoints,
  roundEarnedPoints,
  computeDayScore,
  correctScranId,
} from "@/lib/competitive/scoring";

describe("competitive scoring", () => {
  it("likesPct is likes/(likes+dislikes)", () => {
    expect(likesPct(60, 40)).toBeCloseTo(0.6);
  });

  it("likesPct is 0 when total votes is 0", () => {
    expect(likesPct(0, 0)).toBe(0);
  });

  it("deltaPp is absolute percentage points", () => {
    // 70% vs 50% => 20 pp
    expect(deltaPp(70, 30, 50, 50)).toBeCloseTo(20);
  });

  it("easy wide delta floors at 100 points", () => {
    expect(roundPotentialPoints(20)).toBe(100);
  });

  it("delta 6 => 200 points", () => {
    expect(roundPotentialPoints(6)).toBe(200);
  });

  it("delta 3 => 400 points", () => {
    expect(roundPotentialPoints(3)).toBe(400);
  });

  it("delta 1 caps at 800 points", () => {
    expect(roundPotentialPoints(1)).toBe(800);
  });

  it("wrong answer earns 0", () => {
    expect(roundEarnedPoints(3, false)).toBe(0);
  });

  it("correct answer earns potential points", () => {
    expect(roundEarnedPoints(3, true)).toBe(400);
  });

  it("day score sums points and hits", () => {
    const day = computeDayScore([
      { deltaPp: 20, isCorrect: true },
      { deltaPp: 3, isCorrect: true },
      { deltaPp: 1, isCorrect: false },
    ]);
    expect(day.hits).toBe(2);
    expect(day.points).toBe(100 + 400);
  });

  it("correctScranId returns id with higher likes pct", () => {
    // A: 70%, B: 50%
    expect(correctScranId(10, 20, 70, 30, 50, 50)).toBe(10);
    expect(correctScranId(10, 20, 50, 50, 70, 30)).toBe(20);
  });

  it("correctScranId throws when percentages are equal", () => {
    expect(() => correctScranId(1, 2, 50, 50, 50, 50)).toThrow();
  });
});
