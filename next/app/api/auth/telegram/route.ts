import { NextResponse } from "next/server";
import { verifyTelegramAuth, parseTelegramUser } from "@/lib/telegram-auth";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const BOT_TOKEN = process.env.BOT_TOKEN;

export async function POST(request: Request) {
  if (!BOT_TOKEN) {
    return NextResponse.json(
      { error: "Bot token not configured" },
      { status: 500 }
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

    // Basic freshness check (24h)
    const now = Math.floor(Date.now() / 1000);
    if (parsed.authDate && Math.abs(now - parsed.authDate) > 86400) {
      return NextResponse.json(
        { error: "Auth data expired" },
        { status: 401 }
      );
    }

    const displayName =
      parsed.firstName || parsed.username || `user${parsed.telegramId}`;
    const username = parsed.username || null;

    // Upsert user by telegramId (primary identity)
    const inserted = await db
      .insert(users)
      .values({
        telegramId: parsed.telegramId,
        telegramUsername: username,
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
          updatedAt: new Date(),
        },
      })
      .returning({
        id: users.id,
        telegramId: users.telegramId,
        role: users.role,
      });

    const user = inserted[0];

    // Set secure httpOnly session cookie (value = telegramId for lookup)
    const response = NextResponse.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        role: user.role,
      },
    });

    response.cookies.set("bebebendle_session", String(parsed.telegramId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error("Telegram auth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 400 }
    );
  }
}

// Support logout by clearing the httpOnly session cookie
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("bebebendle_session", "", {
    httpOnly: true,
    expires: new Date(0),
    path: "/",
  });
  return response;
}
