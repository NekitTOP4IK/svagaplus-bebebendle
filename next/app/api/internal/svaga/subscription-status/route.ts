import { NextResponse } from "next/server";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSubscriberStatus } from "@/lib/svaga";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function GET(request: Request) {
  const providedSecret = request.headers.get("x-internal-secret");
  if (!INTERNAL_SECRET || providedSecret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let telegramIdStrForLog: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const telegramIdStr = searchParams.get("telegram_id");
    telegramIdStrForLog = telegramIdStr;

    // Rate limit internal endpoint (per-telegram-id to avoid abuse of SVAGA+ checks)
    const rateKey = telegramIdStr
      ? `internal-svaga:${telegramIdStr}`
      : `internal-svaga-ip:${getClientIp(request)}`;
    const rateLimitResult = await checkRateLimit(rateKey, 30, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

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

    console.log(`[svaga-internal] subscriber check for telegramId=${telegramId}`);

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
        console.log(`[svaga-internal] status stale for ${telegramId}, refreshing from SVAGA+`);
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
        console.log(`[svaga-internal] refreshed for ${telegramId}: isSubscriber=${isSubscriber}`);
      } else {
        isSubscriber = row.isSubscriber ?? false;
        tributeUserId = row.svagaUserId ?? undefined;
        console.log(`[svaga-internal] cache hit for ${telegramId}: isSubscriber=${isSubscriber}`);
      }
    } else {
      // No local user row yet (e.g. bot suggestion before site login)
      // Fetch fresh and cache by creating minimal user entry
      console.log(`[svaga-internal] no local user for ${telegramId}, fetching fresh and upserting`);
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
      console.log(`[svaga-internal] created/updated minimal user for ${telegramId}: isSubscriber=${isSubscriber}`);
    }

    return NextResponse.json({
      isSubscriber,
      tributeUserId,
    });
  } catch (error) {
    console.error(`[svaga-internal] Internal SVAGA subscription-status error for ${telegramIdStrForLog || 'unknown'}:`, error);
    return NextResponse.json(
      { error: "Failed to get subscription status" },
      { status: 500 }
    );
  }
}
