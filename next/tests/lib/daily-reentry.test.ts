import { describe, expect, it } from "vitest";
import { isDailyReentryActive } from "@/lib/daily-reentry";

describe("isDailyReentryActive", () => {
  it("accepts only an unconsumed and non-revoked grant", () => {
    expect(isDailyReentryActive(null)).toBe(false);
    expect(isDailyReentryActive({ consumedAt: null, revokedAt: null })).toBe(true);
    expect(isDailyReentryActive({ consumedAt: new Date(), revokedAt: null })).toBe(false);
    expect(isDailyReentryActive({ consumedAt: null, revokedAt: new Date() })).toBe(false);
  });
});
