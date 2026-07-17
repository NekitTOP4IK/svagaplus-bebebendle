import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, scrans, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { getActiveBan } from "@/lib/user-ban";

/** Author card: stats + recent submissions by telegram id */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const telegramId = (searchParams.get("telegram_id") || "").trim();
    if (!telegramId) {
      return NextResponse.json({ error: "telegram_id required" }, { status: 400 });
    }

    const tgNum = Number(telegramId);
    const userRows =
      Number.isFinite(tgNum) && tgNum > 0
        ? await db.select().from(users).where(eq(users.telegramId, tgNum)).limit(1)
        : [];

    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false)::int`,
        approved: sql<number>`count(*) filter (where ${scrans.approved} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${scrans.rejected} = true)::int`,
      })
      .from(scrans)
      .where(eq(scrans.telegramId, telegramId));

    const recent = await db
      .select({
        id: scrans.id,
        name: scrans.name,
        price: scrans.price,
        approved: scrans.approved,
        rejected: scrans.rejected,
        rejectReason: scrans.rejectReason,
        isSubscriberAtSubmit: scrans.isSubscriberAtSubmit,
        imageUrl: scrans.imageUrl,
      })
      .from(scrans)
      .where(eq(scrans.telegramId, telegramId))
      .orderBy(desc(scrans.id))
      .limit(20);

    const pendingOver =
      (stats[0]?.pending ?? 0) > 6
        ? await db
            .select({ id: scrans.id })
            .from(scrans)
            .where(
              and(
                eq(scrans.telegramId, telegramId),
                eq(scrans.approved, false),
                eq(scrans.rejected, false),
              ),
            )
        : [];

    const ban = await getActiveBan(telegramId);

    return NextResponse.json({
      telegramId,
      user: userRows[0]
        ? {
            id: userRows[0].id,
            username: userRows[0].telegramUsername,
            displayName: userRows[0].displayName,
            photoUrl: userRows[0].telegramPhotoUrl,
            role: userRows[0].role,
            isSubscriber: userRows[0].isSubscriber,
          }
        : null,
      ban: ban
        ? {
            reason: ban.reason,
            reasonCode: ban.reasonCode,
            bannedAt: ban.bannedAt,
          }
        : null,
      banned: ban != null,
      stats: stats[0] ?? { total: 0, pending: 0, approved: 0, rejected: 0 },
      overPendingLimit: (stats[0]?.pending ?? 0) > 6,
      pendingIds: pendingOver.map((p) => p.id),
      recent,
    });
  } catch (error) {
    console.error("[admin/authors]", error);
    return NextResponse.json({ error: "Failed to load author" }, { status: 500 });
  }
}
