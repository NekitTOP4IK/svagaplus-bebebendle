import { describe, it, expect } from "vitest";
import { formatCountdown } from "@/components/competitive/hub-countdown";

describe("formatCountdown long", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");

  it("shows only seconds when under one minute", () => {
    const target = now + 42_000;
    expect(formatCountdown(target, now, "long")).toBe("42с");
  });

  it("shows minutes+seconds without leading zero-hour noise", () => {
    const target = now + (5 * 60 + 12) * 1000;
    expect(formatCountdown(target, now, "long")).toBe("5м 12с");
  });

  it("never starts with 0м", () => {
    const target = now + 9_000;
    expect(formatCountdown(target, now, "long")).not.toMatch(/^0м/);
  });
});
