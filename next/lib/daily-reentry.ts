import { and, desc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import { dailyReentryGrants, dailyScrandles, db, scrans, users } from "@/db/schema";

export const MAX_DAILY_REENTRY_BATCH = 50;

export type ActiveDailyReentry = Readonly<{
  scranId: number;
  scranName: string;
  grantedAt: Date;
  grantedBy: string | null;
  reason: string | null;
}>;

export function isDailyReentryActive(grant: {
  consumedAt: Date | null;
  revokedAt: Date | null;
} | null): boolean {
  return grant !== null && grant.consumedAt === null && grant.revokedAt === null;
}

export async function grantDailyReentries(
  ids: number[],
  actorUserId: number,
  reason: string | null,
): Promise<{ grantedIds: number[]; skippedIds: number[] }> {
  const uniqueIds = [...new Set(ids)].slice(0, MAX_DAILY_REENTRY_BATCH);
  if (uniqueIds.length === 0) return { grantedIds: [], skippedIds: [] };

  const eligible = await db
    .select({ id: scrans.id })
    .from(scrans)
    .where(
      and(
        inArray(scrans.id, uniqueIds),
        eq(scrans.approved, true),
        eq(scrans.rejected, false),
        or(
          exists(
            db
              .select({ id: dailyScrandles.id })
              .from(dailyScrandles)
              .where(and(
                eq(dailyScrandles.source, "regular"),
                eq(dailyScrandles.scranAId, scrans.id),
              )),
          ),
          exists(
            db
              .select({ id: dailyScrandles.id })
              .from(dailyScrandles)
              .where(and(
                eq(dailyScrandles.source, "regular"),
                eq(dailyScrandles.scranBId, scrans.id),
              )),
          ),
        ),
      ),
    );
  const grantedIds = eligible.map((row) => row.id);
  if (grantedIds.length > 0) {
    const now = new Date();
    await db
      .insert(dailyReentryGrants)
      .values(
        grantedIds.map((scranId) => ({
          scranId,
          grantedByUserId: actorUserId,
          reason,
          grantedAt: now,
          consumedAt: null,
          consumedForDate: null,
          revokedAt: null,
        })),
      )
      .onConflictDoUpdate({
        target: dailyReentryGrants.scranId,
        set: {
          grantedByUserId: actorUserId,
          reason,
          grantedAt: now,
          consumedAt: null,
          consumedForDate: null,
          revokedAt: null,
        },
      });
  }
  const grantedSet = new Set(grantedIds);
  return {
    grantedIds,
    skippedIds: uniqueIds.filter((id) => !grantedSet.has(id)),
  };
}

export async function revokeDailyReentries(ids: number[]): Promise<number[]> {
  const uniqueIds = [...new Set(ids)].slice(0, MAX_DAILY_REENTRY_BATCH);
  if (uniqueIds.length === 0) return [];
  const rows = await db
    .update(dailyReentryGrants)
    .set({ revokedAt: new Date() })
    .where(
      and(
        inArray(dailyReentryGrants.scranId, uniqueIds),
        isNull(dailyReentryGrants.consumedAt),
        isNull(dailyReentryGrants.revokedAt),
      ),
    )
    .returning({ scranId: dailyReentryGrants.scranId });
  return rows.map((row) => row.scranId);
}

export async function listActiveDailyReentries(): Promise<ActiveDailyReentry[]> {
  const rows = await db
    .select({
      scranId: dailyReentryGrants.scranId,
      scranName: scrans.name,
      grantedAt: dailyReentryGrants.grantedAt,
      reason: dailyReentryGrants.reason,
      actorUsername: users.telegramUsername,
      actorDisplayName: users.displayName,
    })
    .from(dailyReentryGrants)
    .innerJoin(scrans, eq(dailyReentryGrants.scranId, scrans.id))
    .leftJoin(users, eq(dailyReentryGrants.grantedByUserId, users.id))
    .where(
      and(
        isNull(dailyReentryGrants.consumedAt),
        isNull(dailyReentryGrants.revokedAt),
      ),
    )
    .orderBy(desc(dailyReentryGrants.grantedAt));
  return rows.map((row) => ({
    scranId: row.scranId,
    scranName: row.scranName,
    grantedAt: row.grantedAt,
    grantedBy: row.actorDisplayName || row.actorUsername,
    reason: row.reason,
  }));
}
