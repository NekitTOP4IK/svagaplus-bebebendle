/**
 * Competitive pool: admin allowlist of scrans, vote snapshots, freeze/cooldown.
 */

import { and, asc, eq, or, sql } from "drizzle-orm";
import {
  db,
  scrans,
  competitivePoolEntries,
  competitiveDailies,
  competitiveRounds,
  type CompetitivePoolEntry,
} from "@/db/schema";
import { todayMskDate } from "@/lib/daily-timezone";
import { MIN_COMPETITIVE_VOTES } from "./constants";

/** Pure eligibility gate for adding a scran to the competitive pool. */
export function canAddScranToPool(s: {
  approved: boolean;
  rejected: boolean;
  numberOfLikes: number;
  numberOfDislikes: number;
}): { ok: true } | { ok: false; error: string } {
  if (!s.approved || s.rejected) return { ok: false, error: "Скран не одобрен" };
  const votes = s.numberOfLikes + s.numberOfDislikes;
  if (votes < MIN_COMPETITIVE_VOTES) {
    return { ok: false, error: `Нужно ≥${MIN_COMPETITIVE_VOTES} голосов` };
  }
  return { ok: true };
}

export type PoolRow = {
  id: number;
  scranId: number;
  scranName: string;
  imageUrl: string;
  enabled: boolean;
  likesSnapshot: number;
  dislikesSnapshot: number;
  /** Live original votes on the scran (for admin UI). */
  numberOfLikes: number;
  numberOfDislikes: number;
  lastUsedDate: string | null;
  inTodaysRotation: boolean;
  addedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PoolResult<T> =
  | { ok: true; entry: T }
  | { ok: false; error: string };

/**
 * Whether `scranId` appears in any competitive round for the given MSK date.
 */
export async function isScranInRotation(
  scranId: number,
  dateMsk: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: competitiveRounds.id })
    .from(competitiveRounds)
    .innerJoin(
      competitiveDailies,
      eq(competitiveRounds.dailyId, competitiveDailies.id),
    )
    .where(
      and(
        eq(competitiveDailies.date, dateMsk),
        or(
          eq(competitiveRounds.scranAId, scranId),
          eq(competitiveRounds.scranBId, scranId),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Add an approved scran with enough votes to the competitive pool.
 * Snapshots are initialized from current original likes/dislikes.
 */
export async function addToPool(
  scranId: number,
  actorUserId: number,
): Promise<PoolResult<CompetitivePoolEntry>> {
  const [scran] = await db
    .select()
    .from(scrans)
    .where(eq(scrans.id, scranId))
    .limit(1);

  if (!scran) {
    return { ok: false, error: "Скран не найден" };
  }

  const gate = canAddScranToPool(scran);
  if (!gate.ok) return gate;

  const [existing] = await db
    .select({ id: competitivePoolEntries.id })
    .from(competitivePoolEntries)
    .where(eq(competitivePoolEntries.scranId, scranId))
    .limit(1);

  if (existing) {
    return { ok: false, error: "Скран уже в пуле" };
  }

  try {
    const [entry] = await db
      .insert(competitivePoolEntries)
      .values({
        scranId,
        enabled: true,
        likesSnapshot: scran.numberOfLikes,
        dislikesSnapshot: scran.numberOfDislikes,
        addedByUserId: actorUserId,
      })
      .returning();

    if (!entry) {
      return { ok: false, error: "Не удалось добавить в пул" };
    }
    return { ok: true, entry };
  } catch (error) {
    // Unique scran_id race or other constraint.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unique") || message.includes("duplicate")) {
      return { ok: false, error: "Скран уже в пуле" };
    }
    console.error("[competitive-pool] addToPool failed", scranId, error);
    return { ok: false, error: "Ошибка при добавлении в пул" };
  }
}

/**
 * Enable or disable a pool entry by scran id (soft remove / re-enable).
 */
export async function setPoolEnabled(
  scranId: number,
  enabled: boolean,
): Promise<PoolResult<CompetitivePoolEntry>> {
  const [entry] = await db
    .update(competitivePoolEntries)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(competitivePoolEntries.scranId, scranId))
    .returning();

  if (!entry) {
    return { ok: false, error: "Скран не в пуле" };
  }
  return { ok: true, entry };
}

/**
 * List all pool entries with scran name, live votes, and today's rotation flag.
 */
export async function listPool(dateMsk: string = todayMskDate()): Promise<PoolRow[]> {
  const rows = await db
    .select({
      id: competitivePoolEntries.id,
      scranId: competitivePoolEntries.scranId,
      scranName: scrans.name,
      imageUrl: scrans.imageUrl,
      enabled: competitivePoolEntries.enabled,
      likesSnapshot: competitivePoolEntries.likesSnapshot,
      dislikesSnapshot: competitivePoolEntries.dislikesSnapshot,
      numberOfLikes: scrans.numberOfLikes,
      numberOfDislikes: scrans.numberOfDislikes,
      lastUsedDate: competitivePoolEntries.lastUsedDate,
      addedByUserId: competitivePoolEntries.addedByUserId,
      createdAt: competitivePoolEntries.createdAt,
      updatedAt: competitivePoolEntries.updatedAt,
    })
    .from(competitivePoolEntries)
    .innerJoin(scrans, eq(competitivePoolEntries.scranId, scrans.id))
    .orderBy(asc(competitivePoolEntries.createdAt));

  if (rows.length === 0) return [];

  // Scrans used in today's competitive rounds (rotation = frozen).
  const inRotation = await db
    .select({
      scranAId: competitiveRounds.scranAId,
      scranBId: competitiveRounds.scranBId,
    })
    .from(competitiveRounds)
    .innerJoin(
      competitiveDailies,
      eq(competitiveRounds.dailyId, competitiveDailies.id),
    )
    .where(eq(competitiveDailies.date, dateMsk));

  const rotationIds = new Set<number>();
  for (const r of inRotation) {
    rotationIds.add(r.scranAId);
    rotationIds.add(r.scranBId);
  }

  return rows.map((row) => ({
    ...row,
    inTodaysRotation: rotationIds.has(row.scranId),
  }));
}

/**
 * For all enabled pool entries not used in competitive rounds for `dateMsk`,
 * set snapshot := original likes/dislikes. Returns number of rows updated.
 *
 * Entries in today's rotation stay frozen (snapshot unchanged).
 */
export async function syncCooldownSnapshots(dateMsk: string): Promise<number> {
  const result = await db.execute(sql`
    UPDATE competitive_pool_entries AS cpe
    SET
      likes_snapshot = s.number_of_likes,
      dislikes_snapshot = s.number_of_dislikes,
      updated_at = now()
    FROM scrans AS s
    WHERE cpe.scran_id = s.id
      AND cpe.enabled = true
      AND NOT EXISTS (
        SELECT 1
        FROM competitive_rounds AS cr
        INNER JOIN competitive_dailies AS cd ON cd.id = cr.daily_id
        WHERE cd.date = ${dateMsk}
          AND (cr.scran_a_id = cpe.scran_id OR cr.scran_b_id = cpe.scran_id)
      )
  `);

  return result.rowCount ?? 0;
}
