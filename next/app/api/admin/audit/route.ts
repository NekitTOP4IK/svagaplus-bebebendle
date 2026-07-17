import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, moderationAuditLog, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const scranId = searchParams.get("scran_id");

    const base = db
      .select({
        id: moderationAuditLog.id,
        action: moderationAuditLog.action,
        scranId: moderationAuditLog.scranId,
        targetTelegramId: moderationAuditLog.targetTelegramId,
        details: moderationAuditLog.details,
        createdAt: moderationAuditLog.createdAt,
        actorUserId: moderationAuditLog.actorUserId,
        actorUsername: users.telegramUsername,
        actorDisplayName: users.displayName,
      })
      .from(moderationAuditLog)
      .leftJoin(users, eq(moderationAuditLog.actorUserId, users.id))
      .orderBy(desc(moderationAuditLog.createdAt))
      .limit(limit);

    const rows =
      scranId && !Number.isNaN(parseInt(scranId, 10))
        ? await db
            .select({
              id: moderationAuditLog.id,
              action: moderationAuditLog.action,
              scranId: moderationAuditLog.scranId,
              targetTelegramId: moderationAuditLog.targetTelegramId,
              details: moderationAuditLog.details,
              createdAt: moderationAuditLog.createdAt,
              actorUserId: moderationAuditLog.actorUserId,
              actorUsername: users.telegramUsername,
              actorDisplayName: users.displayName,
            })
            .from(moderationAuditLog)
            .leftJoin(users, eq(moderationAuditLog.actorUserId, users.id))
            .where(eq(moderationAuditLog.scranId, parseInt(scranId, 10)))
            .orderBy(desc(moderationAuditLog.createdAt))
            .limit(limit)
        : await base;

    return NextResponse.json({ logs: rows });
  } catch (error) {
    console.error("[admin/audit]", error);
    return NextResponse.json({ error: "Failed to load audit" }, { status: 500 });
  }
}
