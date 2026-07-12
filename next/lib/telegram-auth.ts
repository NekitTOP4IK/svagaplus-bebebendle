import { createHash, createHmac } from "crypto";

export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string
): boolean {
  if (!botToken || !data.hash) {
    return false;
  }

  const { hash, ...rest } = data;

  // Build data_check_string: sorted key=value pairs joined by newline
  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  // secret_key = SHA256(botToken)
  const secretKey = createHash("sha256").update(botToken).digest();

  // HMAC-SHA256(data_check_string, secretKey)
  const hmac = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return hmac === hash;
}

export function parseTelegramUser(data: Record<string, string>): {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  authDate?: number;
} {
  const telegramId = parseInt(data.id, 10);
  if (isNaN(telegramId) || telegramId <= 0) {
    throw new Error("Invalid telegram id");
  }

  return {
    telegramId,
    username: data.username || undefined,
    firstName: data.first_name || undefined,
    lastName: data.last_name || undefined,
    photoUrl: data.photo_url || undefined,
    authDate: data.auth_date ? parseInt(data.auth_date, 10) : undefined,
  };
}
