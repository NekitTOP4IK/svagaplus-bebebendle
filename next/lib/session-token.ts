import { createHmac, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SECONDS = 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export type AccessClaims = Readonly<{
  version: 1;
  sessionId: string;
  userId: number;
  telegramId: string;
  issuedAt: number;
  expiresAt: number;
}>;

type ClaimsInput = Pick<AccessClaims, "sessionId" | "userId" | "telegramId">;

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function validClaims(value: unknown): value is AccessClaims {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return c.version === 1
    && typeof c.sessionId === "string" && c.sessionId.length > 0
    && Number.isInteger(c.userId) && Number(c.userId) > 0
    && typeof c.telegramId === "string" && /^\d+$/.test(c.telegramId)
    && Number.isInteger(c.issuedAt)
    && Number.isInteger(c.expiresAt);
}

export function signAccessToken(input: ClaimsInput, secret: string, now = new Date()): string {
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const issuedAt = Math.floor(now.getTime() / 1000);
  const claims: AccessClaims = {
    version: 1,
    ...input,
    issuedAt,
    expiresAt: issuedAt + ACCESS_TTL_SECONDS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

export function verifyAccessToken(token: string, secret: string, now = new Date()): AccessClaims | null {
  if (secret.length < 32) return null;
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return null;
  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!validClaims(claims)) return null;
    const timestamp = Math.floor(now.getTime() / 1000);
    if (claims.issuedAt > timestamp + MAX_CLOCK_SKEW_SECONDS) return null;
    if (claims.expiresAt <= timestamp) return null;
    return claims;
  } catch {
    return null;
  }
}
