import { NextResponse } from "next/server";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSubscriberStatus } from "@/lib/svaga";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function GET(request: Request) {
  const providedSecret = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const telegramIdStr = searchParams.get("telegram_id");
    if (!telegramIdStr) {
      return NextResponse.json(
        { error: "telegram_id query param is required" },
        { status: 400 }
      );
    }

    const telegramId = parseInt(telegramIdStr, 10);
    if (isNaN(telegramId) || telegramId <= 0) {
      return NextResponse.json(
        { error: "Invalid telegram_id" },
        { status: 400 }
      );
    }

    const now = new Date();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    // Look up cached status
    const result = await db
      .select({
        isSubscriber: users.isSubscriber,
        lastSyncedAt: users.lastSyncedAt,
        svagaUserId: users.svagaUserId,
      })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    let isSubscriber = false;
    let tributeUserId: string | undefined = undefined;

    if (result.length > 0) {
      const row = result[0];
      const lastSynced = row.lastSyncedAt
        ? new Date(row.lastSyncedAt).getTime()
        : 0;
      const isStale = !lastSynced || now.getTime() - lastSynced > ONE_HOUR_MS;

      if (isStale) {
        // Refresh from SVAGA+
        const fresh = await getSubscriberStatus(telegramId);
        isSubscriber = fresh.isSubscriber;
        tributeUserId = fresh.tributeUserId;

        await db
          .update(users)
          .set({
            svagaTelegramUserId: tributeUserId ? telegramId : null,
            svagaUserId: tributeUserId ?? null,
            isSubscriber,
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(users.telegramId, telegramId));
      } else {
        isSubscriber = row.isSubscriber ?? false;
        tributeUserId = row.svagaUserId ?? undefined;
      }
    } else {
      // No local user row yet (e.g. bot suggestion before site login)
      // Fetch fresh and cache by creating minimal user entry
      const fresh = await getSubscriberStatus(telegramId);
      isSubscriber = fresh.isSubscriber;
      tributeUserId = fresh.tributeUserId;

      await db
        .insert(users)
        .values({
          telegramId,
          telegramUsername: null,
          displayName: `user${telegramId}`,
          role: "player",
          svagaTelegramUserId: tributeUserId ? telegramId : null,
          svagaUserId: tributeUserId ?? null,
          isSubscriber,
          lastSyncedAt: now,
          linkedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.telegramId,
          set: {
            svagaTelegramUserId: tributeUserId ? telegramId : null,
            svagaUserId: tributeUserId ?? null,
            isSubscriber,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });
    }

    return NextResponse.json({
      isSubscriber,
      tributeUserId,
    });
  } catch (error) {
    console.error("Internal SVAGA subscription-status error:", error);
    return NextResponse.json(
      { error: "Failed to get subscription status" },
      { status: 500 }
    );
  }
}
