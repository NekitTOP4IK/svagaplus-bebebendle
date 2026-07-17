import { db, scrans, dailyScrandles } from "@/db/schema";
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
} from "drizzle-orm";
import type { Scran } from "@/db/schema";

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

export function todayUtcDate(): string {
  return new Date().toISOString().split("T")[0];
}

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
  canGenerate: boolean;
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

  return {
    date,
    exists: roundsRaw.length > 0,
    rounds: roundsRaw.map((r) => ({
      roundNumber: r.roundNumber,
      scranAId: r.scranAId,
      scranBId: r.scranBId,
      scranAName: nameById.get(r.scranAId) ?? null,
      scranBName: nameById.get(r.scranBId) ?? null,
    })),
    candidateCount: candidates.length,
    canGenerate: candidates.length >= MIN_SCRANS && roundsRaw.length === 0,
  };
}

export async function createDailyRounds(
  selected: Scran[],
  date: string,
): Promise<{ roundNumber: number; scranA: string; scranB: string }[]> {
  const createdRounds = [];

  for (let roundNumber = 1; roundNumber <= ROUNDS_COUNT; roundNumber++) {
    const scranA = selected[(roundNumber - 1) * 2];
    const scranB = selected[(roundNumber - 1) * 2 + 1];

    await db.insert(dailyScrandles).values({
      date,
      scranAId: scranA.id,
      scranBId: scranB.id,
      roundNumber,
      createdAt: new Date(),
    });

    createdRounds.push({
      roundNumber,
      scranA: scranA.name,
      scranB: scranB.name,
    });
  }

  return createdRounds;
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
