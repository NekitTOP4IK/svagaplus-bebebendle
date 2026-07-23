import { describe, it, expect } from "vitest";
import {
  pairKey,
  bandForRound,
  isDeltaInBand,
  canPair,
  assertUnequalPct,
} from "@/lib/competitive/pairs";
import { DIFFICULTY_BANDS } from "@/lib/competitive/constants";

describe("competitive pairs", () => {
  it("pairKey orders ids ascending", () => {
    expect(pairKey(3, 1)).toBe("1:3");
    expect(pairKey(1, 3)).toBe("1:3");
  });

  it("pairKey allows same id (generator must not use)", () => {
    expect(pairKey(5, 5)).toBe("5:5");
  });

  it("bandForRound(1) is first difficulty band", () => {
    expect(bandForRound(1).minDelta).toBe(12);
    expect(bandForRound(1).maxDelta).toBe(25);
  });

  it("bandForRound(10) is last difficulty band", () => {
    expect(bandForRound(10).minDelta).toBe(1);
    expect(bandForRound(10).maxDelta).toBe(3);
  });

  it("bandForRound covers mid rounds", () => {
    expect(bandForRound(3)).toEqual({ minDelta: 7, maxDelta: 12 });
    expect(bandForRound(6)).toEqual({ minDelta: 3, maxDelta: 7 });
    expect(bandForRound(8)).toEqual({ minDelta: 1, maxDelta: 3 });
  });

  it("bandForRound(0) throws", () => {
    expect(() => bandForRound(0)).toThrow();
  });

  it("bandForRound out of range throws", () => {
    expect(() => bandForRound(11)).toThrow();
    expect(() => bandForRound(-1)).toThrow();
  });

  it("isDeltaInBand is inclusive on both ends", () => {
    expect(isDeltaInBand(12, 12, 25)).toBe(true);
    expect(isDeltaInBand(25, 12, 25)).toBe(true);
    expect(isDeltaInBand(11, 12, 25)).toBe(false);
    expect(isDeltaInBand(26, 12, 25)).toBe(false);
  });

  it("canPair rejects equal like percentages", () => {
    expect(canPair(50, 50, 50, 50)).toBe(false);
    expect(canPair(70, 30, 50, 50)).toBe(true);
  });

  it("assertUnequalPct throws on equal percentages", () => {
    expect(() => assertUnequalPct(50, 50, 25, 25)).toThrow();
  });

  it("assertUnequalPct passes when unequal", () => {
    expect(() => assertUnequalPct(70, 30, 50, 50)).not.toThrow();
  });

  it("DIFFICULTY_BANDS cover rounds 1-10 without gaps", () => {
    for (let r = 1; r <= 10; r++) {
      expect(() => bandForRound(r)).not.toThrow();
    }
    expect(DIFFICULTY_BANDS).toHaveLength(4);
  });
});
