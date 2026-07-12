import { NextResponse } from "next/server";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db
      .select({
        isSubscriber: users.isSubscriber,
        svagaUserId: users.svagaUserId,
        lastSyncedAt: users.lastSyncedAt,
        linkedAt: users.linkedAt,
      })
      .from(users)
      .where(eq(users.telegramId, user.telegramId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({
        isSubscriber: false,
        svagaUserId: null,
        lastSyncedAt: null,
        linkedAt: null,
      });
    }

    const u = result[0];
    return NextResponse.json({
      isSubscriber: u.isSubscriber ?? false,
      svagaUserId: u.svagaUserId,
      lastSyncedAt: u.lastSyncedAt,
      linkedAt: u.linkedAt,
    });
  } catch (error) {
    console.error("Error fetching SVAGA status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
