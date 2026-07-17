import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db/schema";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";
import {
  isBanReasonCode,
  resolveBanReason,
  type BanReasonCode,
} from "@/lib/ban-reasons";
import { banTelegramUser, getActiveBan } from "@/lib/user-ban";

/** GET ?telegram_id= — ban status for author card */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const telegramId = new URL(request.url).searchParams.get("telegram_id")?.trim() || "";
  if (!telegramId) {
    return NextResponse.json({ error: "telegram_id required" }, { status: 400 });
  }

  const ban = await getActiveBan(telegramId);
  return NextResponse.json({
    telegramId,
    banned: ban != null,
    ban: ban
      ? {
          reason: ban.reason,
          reasonCode: ban.reasonCode,
          bannedAt: ban.bannedAt,
        }
      : null,
  });
}

/** POST — ban user by telegram id (moderator+) */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      telegramId?: string;
      reasonCode?: string;
      customNote?: string;
    };

    const telegramId = typeof body.telegramId === "string" ? body.telegramId.trim() : "";
    if (!telegramId || !/^\d{3,20}$/.test(telegramId)) {
      return NextResponse.json({ error: "Invalid telegramId" }, { status: 400 });
    }

    if (String(user.telegramId) === telegramId) {
      return NextResponse.json({ error: "Нельзя забанить себя" }, { status: 400 });
    }

    const tgNum = Number(telegramId);
    if (Number.isFinite(tgNum) && tgNum > 0) {
      const target = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.telegramId, tgNum))
        .limit(1);
      if (target[0] && isStaffRole(target[0].role)) {
        return NextResponse.json(
          { error: "Нельзя банить модераторов и админов" },
          { status: 400 },
        );
      }
    }

    const code: BanReasonCode =
      typeof body.reasonCode === "string" && isBanReasonCode(body.reasonCode)
        ? body.reasonCode
        : "custom";
    const customNote = typeof body.customNote === "string" ? body.customNote : "";
    const resolved = resolveBanReason(code, customNote);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const result = await banTelegramUser({
      telegramId,
      reason: resolved.reason,
      reasonCode: code,
      actor: {
        id: user.id,
        displayName: user.displayName,
        telegramUsername: user.telegramUsername,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/bans] POST", error);
    return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
  }
}
