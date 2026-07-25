"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { db, users } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import type { CurrentUser } from "@/lib/auth-server";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
  writeSessionCookies,
} from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";
import {
  isTelegramAuthDateAcceptable,
  parseTelegramUser,
  verifyTelegramAuth,
} from "@/lib/telegram-auth";
import { verifyAccessToken } from "@/lib/session-token";

const ACCESS_REFRESH_WINDOW_MS = 5 * 60 * 1000;
type RotationResult = Awaited<ReturnType<ReturnType<typeof createSessionManager>["rotate"]>>;
const refreshFlights = new Map<string, Promise<RotationResult>>();

export type EnsureSessionResult =
  | Readonly<{ ok: true; authenticated: boolean; accessExpiresAt: number | null }>
  | Readonly<{
    ok: false;
    code: "refresh_invalid" | "session_not_configured" | "rate_limited";
    message: string;
  }>;

function configuredSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

async function currentIp(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
}

function invalidRefreshResult(): Extract<EnsureSessionResult, { ok: false }> {
  return {
    ok: false,
    code: "refresh_invalid",
    message: "Session refresh is invalid or expired.",
  };
}

async function rotateSingleFlight(refreshToken: string, secret: string) {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const rotation = createSessionManager(sessionRepository, { sessionSecret: secret }).rotate(refreshToken);
  refreshFlights.set(key, rotation);
  try {
    return await rotation;
  } finally {
    refreshFlights.delete(key);
  }
}

export async function loginWithTelegram(
  data: Record<string, string>,
): Promise<ActionResult<{ role: CurrentUser["role"] }, "invalid_telegram" | "expired_telegram" | "session_not_configured" | "rate_limited" | "internal">> {
  const botToken = process.env.BOT_TOKEN;
  const secret = configuredSessionSecret();
  if (!botToken || !secret) {
    return { ok: false, code: "session_not_configured", message: "Session is not configured." };
  }

  const rateLimit = await checkRateLimit(`auth:${await currentIp()}`, 10, 60, "closed");
  if (!rateLimit.allowed) {
    return { ok: false, code: "rate_limited", message: "Too many authentication attempts." };
  }

  try {
    if (!verifyTelegramAuth(data, botToken)) {
      return { ok: false, code: "invalid_telegram", message: "Invalid Telegram authentication." };
    }
    const parsed = parseTelegramUser(data);
    if (!parsed.authDate || !isTelegramAuthDateAcceptable(parsed.authDate, Math.floor(Date.now() / 1000))) {
      return { ok: false, code: "expired_telegram", message: "Telegram authentication has expired." };
    }

    const displayName = parsed.firstName || parsed.username || `user${parsed.telegramId}`;
    const inserted = await db.insert(users).values({
      telegramId: parsed.telegramId,
      telegramUsername: parsed.username || null,
      telegramPhotoUrl: parsed.photoUrl || null,
      displayName,
      role: "player",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: users.telegramId,
      set: {
        telegramUsername: parsed.username || null,
        displayName,
        ...(parsed.photoUrl ? { telegramPhotoUrl: parsed.photoUrl } : {}),
        updatedAt: new Date(),
      },
    }).returning({ id: users.id, telegramId: users.telegramId, role: users.role });
    const user = inserted[0];
    if (!user) {
      return { ok: false, code: "internal", message: "Could not create a session." };
    }
    const issued = await createSessionManager(sessionRepository, { sessionSecret: secret }).create(
      user.id,
      String(user.telegramId),
      (await headers()).get("user-agent"),
    );
    writeSessionCookies(await cookies(), issued);
    return { ok: true, data: { role: user.role as CurrentUser["role"] } };
  } catch (error) {
    console.error("[auth] Telegram login failed", error);
    return { ok: false, code: "internal", message: "Authentication failed." };
  }
}

export async function getSessionSnapshot(): Promise<Readonly<{
  authenticated: boolean;
  accessExpiresAt: number | null;
}>> {
  const secret = configuredSessionSecret();
  if (!secret) return { authenticated: false, accessExpiresAt: null };
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) return { authenticated: false, accessExpiresAt: null };
  const claims = verifyAccessToken(accessToken, secret);
  return claims
    ? { authenticated: true, accessExpiresAt: claims.expiresAt * 1000 }
    : { authenticated: false, accessExpiresAt: null };
}

export async function getAdminSessionSnapshot(): Promise<Readonly<{
  authenticated: boolean;
  role: "moderator" | "admin" | null;
}>> {
  const user = await getCurrentUser();
  if (!user || !isStaffRole(user.role)) {
    return { authenticated: false, role: null };
  }
  return {
    authenticated: true,
    role: user.role === "admin" ? "admin" : "moderator",
  };
}

export async function ensureSession(): Promise<EnsureSessionResult> {
  const secret = configuredSessionSecret();
  if (!secret) {
    return { ok: false, code: "session_not_configured", message: "Session is not configured." };
  }
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const claims = accessToken ? verifyAccessToken(accessToken, secret) : null;
  if (claims && claims.expiresAt * 1000 - Date.now() > ACCESS_REFRESH_WINDOW_MS) {
    return { ok: true, authenticated: true, accessExpiresAt: claims.expiresAt * 1000 };
  }

  const rateLimit = await checkRateLimit(`auth-refresh:${await currentIp()}`, 30, 60, "closed");
  if (!rateLimit.allowed) {
    return { ok: false, code: "rate_limited", message: "Too many session refresh attempts." };
  }
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    clearSessionCookies(cookieStore);
    return invalidRefreshResult();
  }
  const result = await rotateSingleFlight(refreshToken, secret);
  if (result.status !== "ok") {
    clearSessionCookies(cookieStore);
    return invalidRefreshResult();
  }
  writeSessionCookies(cookieStore, result);
  const newAccessClaims = verifyAccessToken(result.accessToken, secret);
  return {
    ok: true,
    authenticated: true,
    accessExpiresAt: newAccessClaims ? newAccessClaims.expiresAt * 1000 : null,
  };
}

export async function logoutCurrentSession(): Promise<ActionResult<null, "internal">> {
  const cookieStore = await cookies();
  try {
    const secret = configuredSessionSecret();
    const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
    if (secret && refreshToken) {
      await createSessionManager(sessionRepository, { sessionSecret: secret }).revoke(refreshToken);
    }
    return { ok: true, data: null };
  } catch (error) {
    console.error("[auth] logout revoke failed", error);
    return { ok: false, code: "internal", message: "Could not revoke the session." };
  } finally {
    clearSessionCookies(cookieStore);
  }
}
