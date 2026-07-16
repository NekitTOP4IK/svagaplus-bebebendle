import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[svaga-status] status query for telegramId=${user.telegramId}`);
  try {
    const result = await db
      .select({
        isSubscriber: users.isSubscriber,
        lastSyncedAt: users.lastSyncedAt,
        lastSyncAttemptAt: users.lastSyncAttemptAt,
        lastSyncError: users.lastSyncError,
      })
      .from(users)
      .where(eq(users.telegramId, user.telegramId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({
        status: "unknown",
        isSubscriber: null,
        lastSyncedAt: null,
        lastSyncAttemptAt: null,
        lastSyncError: null,
      });
    }

    const u = result[0];
    let status: "subscriber" | "not_subscriber" | "unknown";
    if (u.isSubscriber === true) status = "subscriber";
    else if (u.isSubscriber === false) status = "not_subscriber";
    else status = "unknown";

    return NextResponse.json({
      status,
      isSubscriber: u.isSubscriber,
      lastSyncedAt: u.lastSyncedAt,
      lastSyncAttemptAt: u.lastSyncAttemptAt,
      lastSyncError: u.lastSyncError,
    });
  } catch (error) {
    console.error(
      `[svaga-status] Error fetching SVAGA status for ${user.telegramId}:`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 },
    );
  }
}
