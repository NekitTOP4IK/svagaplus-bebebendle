import { describe, it, expect } from "vitest";
import {
  formatTimeUntilMidnightMsk,
  mskDateStartUtc,
  nextMidnightMsk,
  todayMskDate,
} from "@/lib/daily-timezone";

describe("daily-timezone (Europe/Moscow)", () => {
  it("todayMskDate matches UTC calendar day during afternoon UTC", () => {
    // 12:00 UTC = 15:00 MSK same calendar day
    const now = new Date("2024-01-15T12:00:00.000Z");
    expect(todayMskDate(now)).toBe("2024-01-15");
  });

  it("todayMskDate rolls to next day after 00:00 MSK (21:00 UTC previous day)", () => {
    // 21:00 UTC Jan 14 = 00:00 MSK Jan 15
    expect(todayMskDate(new Date("2024-01-14T21:00:00.000Z"))).toBe(
      "2024-01-15",
    );
    // still previous MSK day just before midnight
    expect(todayMskDate(new Date("2024-01-14T20:59:59.000Z"))).toBe(
      "2024-01-14",
    );
  });

  it("nextMidnightMsk is 21:00 UTC on the same UTC date when now is afternoon UTC", () => {
    const now = new Date("2024-01-15T14:30:45.000Z");
    // Next 00:00 MSK = 2024-01-15 21:00 UTC
    expect(nextMidnightMsk(now).toISOString()).toBe("2024-01-15T21:00:00.000Z");
  });

  it("formatTimeUntilMidnightMsk counts down to 00:00 MSK not UTC", () => {
    // 14:30:45 UTC → until 21:00 UTC = 6h 29m 15s
    const now = new Date("2024-01-15T14:30:45.000Z");
    expect(formatTimeUntilMidnightMsk(now)).toBe("06:29:15");
  });

  it("formatTimeUntilMidnightMsk near MSK midnight", () => {
    // 20:59:55 UTC = 23:59:55 MSK → 5 seconds left
    const now = new Date("2024-01-15T20:59:55.000Z");
    expect(formatTimeUntilMidnightMsk(now)).toBe("00:00:05");
  });

  it("after MSK midnight countdown targets the following MSK midnight", () => {
    // 21:00:05 UTC Jan 15 = 00:00:05 MSK Jan 16 → until Jan 16 21:00 UTC
    const now = new Date("2024-01-15T21:00:05.000Z");
    expect(todayMskDate(now)).toBe("2024-01-16");
    expect(formatTimeUntilMidnightMsk(now)).toBe("23:59:55");
  });

  it("mskDateStartUtc is 21:00 UTC on the previous civil day", () => {
    // 00:00 MSK 2024-01-15 = 2024-01-14T21:00:00.000Z
    expect(mskDateStartUtc("2024-01-15").toISOString()).toBe(
      "2024-01-14T21:00:00.000Z",
    );
    expect(todayMskDate(mskDateStartUtc("2024-01-15"))).toBe("2024-01-15");
  });
});
