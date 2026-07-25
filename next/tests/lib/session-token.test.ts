// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/lib/session-token";

/** Synthetic HMAC keys for unit tests only (≥32 chars, not real secrets). */
const SESSION_SECRET = "unit-test-only-session-secret-aaaa";
const OTHER_SESSION_SECRET = "unit-test-only-session-secret-bbbb";
const now = new Date("2026-07-16T12:00:00Z");

describe("session access token", () => {
  it("round-trips valid claims", () => {
    const token = signAccessToken(
      { sessionId: "s1", userId: 7, telegramId: "123" },
      SESSION_SECRET,
      now,
    );
    expect(
      verifyAccessToken(token, SESSION_SECRET, new Date("2026-07-16T12:59:59Z")),
    ).toMatchObject({
      version: 1,
      sessionId: "s1",
      userId: 7,
      telegramId: "123",
    });
  });

  it("accepts a token one second before its one-hour expiry and rejects it at expiry", () => {
    const token = signAccessToken(
      { sessionId: "s1", userId: 7, telegramId: "123" },
      SESSION_SECRET,
      now,
    );

    expect(
      verifyAccessToken(token, SESSION_SECRET, new Date("2026-07-16T12:59:59Z")),
    ).toMatchObject({ expiresAt: 1_784_206_800 });
    expect(
      verifyAccessToken(token, SESSION_SECRET, new Date("2026-07-16T13:00:00Z")),
    ).toBeNull();
  });

  it("rejects tampering and the old raw Telegram ID cookie", () => {
    const token = signAccessToken(
      { sessionId: "s1", userId: 7, telegramId: "123" },
      SESSION_SECRET,
      now,
    );
    expect(verifyAccessToken(`${token}x`, SESSION_SECRET, now)).toBeNull();
    expect(verifyAccessToken("123456789", SESSION_SECRET, now)).toBeNull();
  });

  it("rejects expiry, future issue time, and wrong secret", () => {
    const token = signAccessToken(
      { sessionId: "s1", userId: 7, telegramId: "123" },
      SESSION_SECRET,
      now,
    );
    expect(
      verifyAccessToken(token, SESSION_SECRET, new Date("2026-07-16T13:00:01Z")),
    ).toBeNull();
    expect(verifyAccessToken(token, OTHER_SESSION_SECRET, now)).toBeNull();
    expect(
      verifyAccessToken(token, SESSION_SECRET, new Date("2026-07-16T11:54:59Z")),
    ).toBeNull();
  });
});
