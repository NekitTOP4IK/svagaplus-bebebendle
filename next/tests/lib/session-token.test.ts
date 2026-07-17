// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "@/lib/session-token";

// Fixture strings only — not real credentials (avoid gitleaks generic-api-key on hex blobs).
const secret = "test-session-signing-secret-v1";
const wrongSecret = "test-session-signing-secret-v2-wrong";
const now = new Date("2026-07-16T12:00:00Z");

describe("session access token", () => {
  it("round-trips valid claims", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T12:59:59Z"))).toMatchObject({
      version: 1,
      sessionId: "s1",
      userId: 7,
      telegramId: "123",
    });
  });

  it("rejects tampering and the old raw Telegram ID cookie", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(`${token}x`, secret, now)).toBeNull();
    expect(verifyAccessToken("123456789", secret, now)).toBeNull();
  });

  it("rejects expiry, future issue time, and wrong secret", () => {
    const token = signAccessToken({ sessionId: "s1", userId: 7, telegramId: "123" }, secret, now);
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T13:00:01Z"))).toBeNull();
    expect(verifyAccessToken(token, wrongSecret, now)).toBeNull();
    expect(verifyAccessToken(token, secret, new Date("2026-07-16T11:54:59Z"))).toBeNull();
  });
});
