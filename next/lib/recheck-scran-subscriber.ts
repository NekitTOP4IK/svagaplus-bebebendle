import { and, eq, isNull, sql } from "drizzle-orm";
import { db, scrans } from "@/db/schema";
import { getSubscriberStatus } from "@/lib/svaga";
import { userSvagaRepository } from "@/lib/svaga-status-service";

export type RecheckResult = Readonly<{
  scranId: number;
  telegramId: string | null;
  ok: boolean;
  isSubscriber?: boolean;
  reason?: string;
}>;

function parseTelegramId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function recheckScranSubscriber(scranId: number): Promise<RecheckResult> {
  const [row] = await db
    .select({
      id: scrans.id,
      telegramId: scrans.telegramId,
      isSubscriberAtSubmit: scrans.isSubscriberAtSubmit,
    })
    .from(scrans)
    .where(eq(scrans.id, scranId))
    .limit(1);

  if (!row) {
    return { scranId, telegramId: null, ok: false, reason: "not_found" };
  }

  const tg = parseTelegramId(row.telegramId);
  if (tg === null) {
    return {
      scranId,
      telegramId: row.telegramId,
      ok: false,
      reason: "no_telegram_id",
    };
  }

  const status = await getSubscriberStatus(tg);
  if (status.status !== "ok") {
    return {
      scranId,
      telegramId: row.telegramId,
      ok: false,
      reason: status.reason,
    };
  }

  await db
    .update(scrans)
    .set({
      isSubscriberAtSubmit: status.isSubscriber,
      subscriberCheckedAt: status.checkedAt,
    })
    .where(eq(scrans.id, scranId));

  await userSvagaRepository.ensureUser(tg);
  await userSvagaRepository.saveSuccess(tg, status.isSubscriber, status.checkedAt);

  return {
    scranId,
    telegramId: row.telegramId,
    ok: true,
    isSubscriber: status.isSubscriber,
  };
}

export async function recheckUncheckedScrans(limit = 50): Promise<{
  total: number;
  results: RecheckResult[];
}> {
  const rows = await db
    .select({ id: scrans.id })
    .from(scrans)
    .where(
      and(
        eq(scrans.approved, false),
        eq(scrans.rejected, false),
        isNull(scrans.isSubscriberAtSubmit),
      ),
    )
    .orderBy(sql`${scrans.id} asc`)
    .limit(limit);

  const results: RecheckResult[] = [];
  for (const row of rows) {
    results.push(await recheckScranSubscriber(row.id));
  }
  return { total: rows.length, results };
}
