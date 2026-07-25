import { cookies } from "next/headers";
import { desc, eq, or } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth-server";
import { db, dailyUserResults, scrans, users } from "@/db/schema";

export type SvagaStatusView = Readonly<{
  status: "subscriber" | "not_subscriber" | "unknown";
  isSubscriber: boolean | null;
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
}>;

export async function getSvagaStatusView(user: CurrentUser): Promise<SvagaStatusView> {
  const [row] = await db.select({
    isSubscriber: users.isSubscriber,
    lastSyncedAt: users.lastSyncedAt,
    lastSyncAttemptAt: users.lastSyncAttemptAt,
    lastSyncError: users.lastSyncError,
  }).from(users).where(eq(users.telegramId, user.telegramId)).limit(1);
  const isSubscriber = row?.isSubscriber ?? null;
  return {
    status: isSubscriber === true ? "subscriber" : isSubscriber === false ? "not_subscriber" : "unknown",
    isSubscriber,
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
    lastSyncAttemptAt: row?.lastSyncAttemptAt?.toISOString() ?? null,
    lastSyncError: row?.lastSyncError ?? null,
  };
}

export async function getProfileView(user: CurrentUser) {
  const [myScrans, userResults] = await Promise.all([
    db.select({
      id: scrans.id, imageUrl: scrans.imageUrl, name: scrans.name, description: scrans.description,
      price: scrans.price, numberOfLikes: scrans.numberOfLikes, numberOfDislikes: scrans.numberOfDislikes,
      approved: scrans.approved, rejected: scrans.rejected, rejectReason: scrans.rejectReason,
      isSubscriberAtSubmit: scrans.isSubscriberAtSubmit, submittedByUserId: scrans.submittedByUserId,
    }).from(scrans).where(or(eq(scrans.submittedByUserId, user.id), eq(scrans.telegramId, String(user.telegramId))))
      .orderBy(desc(scrans.id)).limit(100),
    db.selectDistinct({ date: dailyUserResults.date, score: dailyUserResults.score, createdAt: dailyUserResults.createdAt })
      .from(dailyUserResults).where(eq(dailyUserResults.userId, user.id)).orderBy(desc(dailyUserResults.date)).limit(100),
  ]);
  const sessionId = (await cookies()).get("scrandle_session")?.value;
  const sessionResults = sessionId
    ? await db.selectDistinct({ date: dailyUserResults.date, score: dailyUserResults.score, createdAt: dailyUserResults.createdAt })
      .from(dailyUserResults).where(eq(dailyUserResults.sessionId, sessionId)).orderBy(desc(dailyUserResults.date)).limit(100)
    : [];
  const byDate = new Map<string, (typeof userResults)[number]>();
  for (const item of [...sessionResults, ...userResults]) if (!byDate.has(item.date)) byDate.set(item.date, item);
  return {
    user: { ...user },
    scrans: myScrans,
    history: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100).map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    svagaStatus: await getSvagaStatusView(user),
  };
}
