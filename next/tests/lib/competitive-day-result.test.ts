import { describe, expect, it } from "vitest";
import { betterThanPercent } from "@/lib/competitive/day-result";

describe("betterThanPercent", () => {
  it("reports the share of players scoring strictly lower", () => {
    expect(betterThanPercent(3, 4)).toBe(75);
  });

  it("divides the worse count by the total player count", () => {
    expect(betterThanPercent(7, 10)).toBe(70);
  });

  it("returns null when the player is alone", () => {
    expect(betterThanPercent(0, 1)).toBeNull();
  });

  it("returns null when nobody has played", () => {
    expect(betterThanPercent(0, 0)).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(betterThanPercent(1, 3)).toBe(33);
  });
});
