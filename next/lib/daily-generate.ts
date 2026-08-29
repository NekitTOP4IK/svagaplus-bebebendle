import { db, scrans, dailyReentryGrants, dailyScrandles } from "@/db/schema";
import {
  eq,
  and,
  sql,
  getTableColumns,
  notExists,
  or,
  gt,
  asc,
  inArray,
  exists,
  isNull,
} from "drizzle-orm";
import type { Scran } from "@/db/schema";
import { todayMskDate } from "@/lib/daily-timezone";

export const MIN_SCRANS = 20;
export const ROUNDS_COUNT = 10;
export const MIN_VOTES = 10;

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Calendar day for daily generation / lookup (00:00 Europe/Moscow). */
export function todayUtcDate(): string {
  // Kept export name for call-site stability; value is MSK date, not UTC.
  return todayMskDate();
}

export { todayMskDate };

export async function getApprovedScransWithVotes(): Promise<Scran[]> {
  const rating = sql<number>`
    round(
      (${scrans.numberOfLikes})::numeric
      / nullif(${scrans.numberOfLikes} + ${scrans.numberOfDislikes}, 0),
      2
    )
  `
    .mapWith(Number)
    .as("rating");

  const candidates = db
    .select({
      ...getTableColumns(scrans),
      rating,
    })
    .from(scrans)
    .where(
      and(
        or(
          notExists(
            db
              .select({ one: sql`1` })
              .from(dailyScrandles)
              .where(
                or(
                  eq(dailyScrandles.scranAId, scrans.id),
                  eq(dailyScrandles.scranBId, scrans.id),
                ),
              ),
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(dailyReentryGrants)
              .where(
                and(
                  eq(dailyReentryGrants.scranId, scrans.id),
                  isNull(dailyReentryGrants.consumedAt),
                  isNull(dailyReentryGrants.revokedAt),
                ),
              ),
          ),
        ),
        gt(
          sql<number>`${scrans.numberOfLikes} + ${scrans.numberOfDislikes}`,
          MIN_VOTES,
        ),
        eq(scrans.approved, true),
      ),
    )
    .as("candidates");

  return db
    .selectDistinctOn([candidates.rating])
    .from(candidates)
    .orderBy(asc(candidates.rating))
    .limit(20);
}

export async function hasRoundsForDate(date: string): Promise<boolean> {
  const existing = await db
    .select({ id: dailyScrandles.id })
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, date))
    .limit(1);
  return existing.length > 0;
}

export async function getDailyPreview(date: string): Promise<{
  date: string;
  exists: boolean;
  rounds: Array<{
    roundNumber: number;
    scranAId: number;
    scranBId: number;
    scranAName: string | null;
    scranBName: string | null;
  }>;
  candidateCount: number;
  minScrans: number;
  canGenerate: boolean;
  /** Why pool-level generate is blocked (ignores admin generation toggle). */
  blockReason: string | null;
}> {
  const roundsRaw = await db
    .select({
      roundNumber: dailyScrandles.roundNumber,
      scranAId: dailyScrandles.scranAId,
      scranBId: dailyScrandles.scranBId,
    })
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, date))
    .orderBy(asc(dailyScrandles.roundNumber));

  const nameById = new Map<number, string>();
  if (roundsRaw.length > 0) {
    const ids = [...new Set(roundsRaw.flatMap((r) => [r.scranAId, r.scranBId]))];
    const names = await db
      .select({ id: scrans.id, name: scrans.name })
      .from(scrans)
      .where(inArray(scrans.id, ids));
    for (const n of names) nameById.set(n.id, n.name);
  }

  const candidates = await getApprovedScransWithVotes();
  const exists = roundsRaw.length > 0;
  let blockReason: string | null = null;
  if (exists) {
    blockReason = "Daily на эту дату уже создан";
  } else if (candidates.length < MIN_SCRANS) {
    blockReason = `Мало кандидатов: ${candidates.length}/${MIN_SCRANS} (нужны одобренные с ≥${MIN_VOTES} голосами, не использованные в daily)`;
  }

  return {
    date,
    exists,
    rounds: roundsRaw.map((r) => ({
      roundNumber: r.roundNumber,
      scranAId: r.scranAId,
      scranBId: r.scranBId,
      scranAName: nameById.get(r.scranAId) ?? null,
      scranBName: nameById.get(r.scranBId) ?? null,
    })),
    candidateCount: candidates.length,
    minScrans: MIN_SCRANS,
    canGenerate: !exists && candidates.length >= MIN_SCRANS,
    blockReason,
  };
}

export async function createDailyRounds(
  selected: Scran[],
  date: string,
): Promise<{ roundNumber: number; scranA: string; scranB: string }[]> {
  const createdAt = new Date();
  const createdRounds = Array.from({ length: ROUNDS_COUNT }, (_, index) => {
    const scranA = selected[index * 2]!;
    const scranB = selected[index * 2 + 1]!;
    return {
      roundNumber: index + 1,
      scranA,
      scranB,
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(dailyScrandles).values(
      createdRounds.map(({ roundNumber, scranA, scranB }) => ({
        date,
        scranAId: scranA.id,
        scranBId: scranB.id,
        roundNumber,
        createdAt,
      })),
    );
    await tx
      .update(dailyReentryGrants)
      .set({ consumedAt: createdAt, consumedForDate: date })
      .where(
        and(
          inArray(
            dailyReentryGrants.scranId,
            selected.map((scran) => scran.id),
          ),
          isNull(dailyReentryGrants.consumedAt),
          isNull(dailyReentryGrants.revokedAt),
        ),
      );
  });

  return createdRounds.map(({ roundNumber, scranA, scranB }) => ({
    roundNumber,
    scranA: scranA.name,
    scranB: scranB.name,
  }));
}

export async function generateDailyForDate(date: string): Promise<
  | {
      ok: true;
      date: string;
      rounds: { roundNumber: number; scranA: string; scranB: string }[];
      notify?: { sent: number; skipped: number; disabled: boolean };
    }
  | { ok: false; error: string; status: number }
> {
  const { isDailyGenerationEnabled, getDailyDisabledReason } = await import(
    "@/lib/app-settings"
  );
  if (!(await isDailyGenerationEnabled())) {
    const reason = await getDailyDisabledReason();
    return {
      ok: false,
      error: `Генерация daily выключена: ${reason}`,
      status: 403,
    };
  }

  if (await hasRoundsForDate(date)) {
    return { ok: false, error: "Daily scrandles already exist for this date", status: 409 };
  }

  const approvedScrans = await getApprovedScransWithVotes();
  if (approvedScrans.length < MIN_SCRANS) {
    return {
      ok: false,
      error: `Not enough scrans (need ${MIN_SCRANS}, found ${approvedScrans.length})`,
      status: 400,
    };
  }

  const selected = shuffle(approvedScrans).slice(0, MIN_SCRANS);
  const rounds = await createDailyRounds(selected, date);

  // Fire-and-log TG notifications when admin setting is on
  let notify: { sent: number; skipped: number; disabled: boolean } | undefined;
  try {
    const { notifyAuthorsDailyRotation } = await import("@/lib/daily-rotation-notify");
    notify = await notifyAuthorsDailyRotation(
      date,
      selected.map((s) => ({
        id: s.id,
        name: s.name,
        telegramId: s.telegramId ?? null,
      })),
    );
    if (!notify.disabled) {
      console.log(
        `[daily] rotation notify date=${date} sent=${notify.sent} skipped=${notify.skipped}`,
      );
    }
  } catch (error) {
    console.error("[daily] rotation notify failed", error);
  }

  return { ok: true, date, rounds, notify };
}
