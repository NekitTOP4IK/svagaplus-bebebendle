import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import { verifyTelegramAuth, parseTelegramUser } from "../../lib/telegram-auth";

function createValidTelegramData(
  botToken: string,
  fields: Record<string, string>
): Record<string, string> {
  const { hash: _ignored, ...rest } = fields;
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const hmac = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return { ...rest, hash: hmac };
}

describe("telegram-auth", () => {
  const BOT_TOKEN = "123456:ABCDEF1234ghIkl-zyx57W2v1u123ew11";

  it("verifies valid Telegram Login Widget auth data", () => {
    const fields = {
      id: "123456789",
      first_name: "Alice",
      username: "alice_test",
      auth_date: "1720800000",
      photo_url: "https://example.com/photo.jpg",
    };
    const data = createValidTelegramData(BOT_TOKEN, fields);
    expect(verifyTelegramAuth(data, BOT_TOKEN)).toBe(true);
  });

  it("rejects data with invalid hash", () => {
    const data = {
      id: "123456789",
      first_name: "Alice",
      hash: "0000000000000000000000000000000000000000000000000000000000000000",
      auth_date: "1720800000",
    };
    expect(verifyTelegramAuth(data, BOT_TOKEN)).toBe(false);
  });

  it("rejects when bot token is missing", () => {
    const data = { id: "1", hash: "abc" };
    expect(verifyTelegramAuth(data, "")).toBe(false);
  });

  it("rejects when hash missing", () => {
    const data = { id: "1" };
    expect(verifyTelegramAuth(data, BOT_TOKEN)).toBe(false);
  });

  it("parses telegram user data correctly", () => {
    const data = {
      id: "987654321",
      first_name: "Bob",
      username: "bobsmith",
      last_name: "Smith",
      auth_date: "1720801234",
    };
    const parsed = parseTelegramUser(data);
    expect(parsed.telegramId).toBe(987654321);
    expect(parsed.firstName).toBe("Bob");
    expect(parsed.username).toBe("bobsmith");
    expect(parsed.lastName).toBe("Smith");
    expect(parsed.authDate).toBe(1720801234);
  });

  it("throws on invalid telegram id during parse", () => {
    expect(() => parseTelegramUser({ id: "not-a-number" })).toThrow(
      "Invalid telegram id"
    );
    expect(() => parseTelegramUser({ id: "0" })).toThrow("Invalid telegram id");
  });
});
