import { eq } from "drizzle-orm";
import {
  competitiveDailies,
  competitivePoolEntries,
  db,
  scrans,
} from "@/db/schema";
import { todayMskDate } from "@/lib/daily-timezone";
import {
  COMPETITIVE_ROUNDS,
  DIFFICULTY_BANDS,
  MIN_COMPETITIVE_VOTES,
} from "@/lib/competitive/constants";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { canPair, isDeltaInBand } from "@/lib/competitive/pairs";
import { syncCooldownSnapshots } from "@/lib/competitive/pool";
import { deltaPp } from "@/lib/competitive/scoring";
import { generateCompetitiveDaily } from "@/lib/competitive/generate";
import { getPlayableSeason } from "@/lib/competitive/seasons";

export type CompetitiveDailyPreview = Awaited<ReturnType<typeof buildPreview>>;

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function buildPreview(date: string): Promise<{
  date: string;
  enabled: boolean;
  playableSeason: {
    id: number;
    name: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
  } | null;
  existingDaily: { id: number; date: string; seasonId: number; createdAt: Date } | null;
  poolEnabledCount: number;
  candidateCount: number;
  minCandidatesNeeded: number;
  syncedRows: number;
  bands: Array<{
    roundStart: number;
    roundEnd: number;
    minDelta: number;
    maxDelta: number;
    pairCount: number;
  }>;
}> {
  const [enabled, playableSeason, existingRows] = await Promise.all([
    isCompetitiveEnabled(),
    getPlayableSeason(),
    db
      .select({
        id: competitiveDailies.id,
        date: competitiveDailies.date,
        seasonId: competitiveDailies.seasonId,
        createdAt: competitiveDailies.createdAt,
      })
      .from(competitiveDailies)
      .where(eq(competitiveDailies.date, date))
      .limit(1),
  ]);

  let syncedRows = 0;
  try {
    syncedRows = await syncCooldownSnapshots(date);
  } catch (error) {
    console.error("[admin/competitive/daily] preview sync failed", error);
  }

  const poolRows = await db
    .select({
      scranId: competitivePoolEntries.scranId,
      likesSnapshot: competitivePoolEntries.likesSnapshot,
      dislikesSnapshot: competitivePoolEntries.dislikesSnapshot,
      numberOfLikes: scrans.numberOfLikes,
      numberOfDislikes: scrans.numberOfDislikes,
      enabled: competitivePoolEntries.enabled,
    })
    .from(competitivePoolEntries)
    .innerJoin(scrans, eq(competitivePoolEntries.scranId, scrans.id));
  const candidates = poolRows
    .filter(
      (row) =>
        row.enabled &&
        row.numberOfLikes + row.numberOfDislikes >= MIN_COMPETITIVE_VOTES,
    )
    .map((row) => ({
      scranId: row.scranId,
      likes: row.likesSnapshot,
      dislikes: row.dislikesSnapshot,
    }));
  const bands = DIFFICULTY_BANDS.map((band) => ({
    roundStart: band.roundStart,
    roundEnd: band.roundEnd,
    minDelta: band.minDelta,
    maxDelta: band.maxDelta,
    pairCount: 0,
  }));

  for (let left = 0; left < candidates.length; left += 1) {
    const first = candidates[left]!;
    for (let right = left + 1; right < candidates.length; right += 1) {
      const second = candidates[right]!;
      if (!canPair(first.likes, first.dislikes, second.likes, second.dislikes)) {
        continue;
      }
      const delta = deltaPp(
        first.likes,
        first.dislikes,
        second.likes,
        second.dislikes,
      );
      const band = bands.find((item) =>
        isDeltaInBand(delta, item.minDelta, item.maxDelta),
      );
      if (band) band.pairCount += 1;
    }
  }

  return {
    date,
    enabled,
    playableSeason: playableSeason
      ? {
          id: playableSeason.id,
          name: playableSeason.name,
          status: playableSeason.status,
          startsAt: playableSeason.startsAt,
          endsAt: playableSeason.endsAt,
        }
      : null,
    existingDaily: existingRows[0] ?? null,
    poolEnabledCount: poolRows.filter((row) => row.enabled).length,
    candidateCount: candidates.length,
    minCandidatesNeeded: COMPETITIVE_ROUNDS * 2,
    syncedRows,
    bands,
  };
}

export async function getCompetitiveDailyPreview(
  date = todayMskDate(),
): Promise<CompetitiveDailyPreview> {
  if (!isDate(date)) throw new Error("Invalid date");
  return buildPreview(date);
}

export async function generateCompetitiveDailyForDate(date = todayMskDate()) {
  if (!isDate(date)) return { ok: false as const, error: "Invalid date", status: 400 };
  return generateCompetitiveDaily(date);
}
