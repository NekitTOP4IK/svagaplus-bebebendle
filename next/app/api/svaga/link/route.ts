import { NextResponse } from "next/server";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import { getSubscriberStatus } from "@/lib/svaga";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(`[svaga-link] linking initiated for telegramId=${user.telegramId} (userId=${user.id})`);
  try {
    const status = await getSubscriberStatus(user.telegramId);
    const now = new Date();

    // Fetch current linkedAt to preserve it on re-link/refresh
    const current = await db
      .select({ linkedAt: users.linkedAt })
      .from(users)
      .where(eq(users.telegramId, user.telegramId))
      .limit(1);

    // Only set svaga link fields + linkedAt if we actually received a tribute id (i.e. linked account on svagaplus)
    const hasLink = !!status.tributeUserId;
    const linkedAtValue = hasLink
      ? (current[0]?.linkedAt ?? now)
      : current[0]?.linkedAt ?? null;

    await db
      .update(users)
      .set({
        svagaTelegramUserId: hasLink ? user.telegramId : null,
        svagaUserId: status.tributeUserId ?? null,
        isSubscriber: status.isSubscriber,
        lastSyncedAt: now,
        linkedAt: linkedAtValue,
        updatedAt: now,
      })
      .where(eq(users.telegramId, user.telegramId));

    console.log(`[svaga-link] link/refresh success for telegramId=${user.telegramId}: isSubscriber=${status.isSubscriber} hasLink=${hasLink}`);
    return NextResponse.json({
      success: true,
      isSubscriber: status.isSubscriber,
      tributeUserId: status.tributeUserId,
    });
  } catch (error) {
    console.error(`[svaga-link] SVAGA+ link error for telegramId=${user.telegramId}:`, error);
    // Provide more specific error for linking failures (e.g. upstream or db)
    const msg = error instanceof Error && error.message.includes("fetch") 
      ? "SVAGA+ service unavailable, please try again later" 
      : "Failed to link SVAGA+ status";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
