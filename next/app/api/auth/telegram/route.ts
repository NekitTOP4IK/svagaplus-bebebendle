import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import { db, users } from "@/db/schema";
import { setSessionCookies } from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";
import {
  isTelegramAuthDateAcceptable,
  parseTelegramUser,
  verifyTelegramAuth,
} from "@/lib/telegram-auth";

const BOT_TOKEN = process.env.BOT_TOKEN;

export async function POST(request: Request) {
  if (!BOT_TOKEN) {
    return NextResponse.json(
      { error: "Bot token not configured" },
      { status: 500 }
    );
  }

  const rateLimitResult = await checkRateLimit(
    `auth:${getClientIp(request)}`,
    10,
    60,
    "closed",
  );
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "session_not_configured" },
      { status: 503 },
    );
  }

  try {
    const data: Record<string, string> = await request.json();

    if (!verifyTelegramAuth(data, BOT_TOKEN)) {
      return NextResponse.json(
        { error: "Invalid Telegram authentication" },
        { status: 401 }
      );
    }

    const parsed = parseTelegramUser(data);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !parsed.authDate
      || !isTelegramAuthDateAcceptable(parsed.authDate, nowSeconds)
    ) {
      return NextResponse.json(
        { error: "Auth data expired" },
        { status: 401 }
      );
    }

    const displayName =
      parsed.firstName || parsed.username || `user${parsed.telegramId}`;
    const username = parsed.username || null;

    const photoUrl = parsed.photoUrl || null;

    const inserted = await db
      .insert(users)
      .values({
        telegramId: parsed.telegramId,
        telegramUsername: username,
        telegramPhotoUrl: photoUrl,
        displayName,
        role: "player",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.telegramId,
        set: {
          telegramUsername: username,
          displayName,
          ...(photoUrl ? { telegramPhotoUrl: photoUrl } : {}),
          updatedAt: new Date(),
        },
      })
      .returning({
        id: users.id,
        telegramId: users.telegramId,
        role: users.role,
      });

    const user = inserted[0];
    const manager = createSessionManager(sessionRepository, { sessionSecret: secret });
    const issued = await manager.create(
      user.id,
      String(parsed.telegramId),
      request.headers.get("user-agent"),
    );

    const response = NextResponse.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        role: user.role,
      },
    });
    setSessionCookies(response, issued);
    return response;
  } catch (error) {
    console.error("Telegram auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 400 }
    );
  }
}
