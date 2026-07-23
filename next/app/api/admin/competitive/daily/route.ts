import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  scrans,
  competitivePoolEntries,
  competitiveDailies,
} from "@/db/schema";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  COMPETITIVE_ROUNDS,
  DIFFICULTY_BANDS,
  MIN_COMPETITIVE_VOTES,
} from "@/lib/competitive/constants";
import { generateCompetitiveDaily } from "@/lib/competitive/generate";
import { canPair, isDeltaInBand } from "@/lib/competitive/pairs";
import { syncCooldownSnapshots } from "@/lib/competitive/pool";
import { deltaPp } from "@/lib/competitive/scoring";
import { getPlayableSeason } from "@/lib/competitive/seasons";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { todayMskDate } from "@/lib/daily-timezone";

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type BandPreview = {
  roundStart: number;
  roundEnd: number;
  minDelta: number;
  maxDelta: number;
  /** Number of valid unordered pairs whose Δ falls in this band. */
  pairCount: number;
};

/**
 * Best-effort preview: sync cooldown snapshots, then count valid pairs per
 * difficulty band among enabled pool candidates (original votes ≥ 15).
 */
async function buildPreview(dateMsk: string) {
  const enabled = await isCompetitiveEnabled();
  const playableSeason = await getPlayableSeason();

  const [existing] = await db
    .select({
      id: competitiveDailies.id,
      date: competitiveDailies.date,
      seasonId: competitiveDailies.seasonId,
      createdAt: competitiveDailies.createdAt,
    })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.date, dateMsk))
    .limit(1);

  let synced = 0;
  try {
    synced = await syncCooldownSnapshots(dateMsk);
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

  const enabledCount = poolRows.filter((r) => r.enabled).length;
  const candidates = poolRows
    .filter(
      (r) =>
        r.enabled &&
        r.numberOfLikes + r.numberOfDislikes >= MIN_COMPETITIVE_VOTES,
    )
    .map((r) => ({
      scranId: r.scranId,
      likes: r.likesSnapshot,
      dislikes: r.dislikesSnapshot,
    }));

  const bands: BandPreview[] = DIFFICULTY_BANDS.map((b) => ({
    roundStart: b.roundStart,
    roundEnd: b.roundEnd,
    minDelta: b.minDelta,
    maxDelta: b.maxDelta,
    pairCount: 0,
  }));

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]!;
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j]!;
      if (!canPair(a.likes, a.dislikes, b.likes, b.dislikes)) continue;
      const delta = deltaPp(a.likes, a.dislikes, b.likes, b.dislikes);
      if (!(delta > 0)) continue;
      for (const band of bands) {
        if (isDeltaInBand(delta, band.minDelta, band.maxDelta)) {
          band.pairCount += 1;
          break;
        }
      }
    }
  }

  return {
    date: dateMsk,
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
    existingDaily: existing ?? null,
    poolEnabledCount: enabledCount,
    candidateCount: candidates.length,
    minCandidatesNeeded: COMPETITIVE_ROUNDS * 2,
    syncedRows: synced,
    bands,
  };
}

/** GET — preview candidate counts per band after sync. Admin only. */
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayMskDate();
    if (!isDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const preview = await buildPreview(date);
    return NextResponse.json(preview);
  } catch (error) {
    console.error("[admin/competitive/daily] GET", error);
    return NextResponse.json(
      { error: "Failed to load competitive daily preview" },
      { status: 500 },
    );
  }
}

/** POST — generate competitive daily for a date. Admin only. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { date?: unknown };
    const date =
      typeof body.date === "string" && body.date
        ? body.date
        : todayMskDate();
    if (!isDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await generateCompetitiveDaily(date);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.daily.generate",
      details: JSON.stringify({ date, dailyId: result.dailyId }),
    });

    return NextResponse.json({
      message: "Competitive daily created",
      date,
      dailyId: result.dailyId,
    });
  } catch (error) {
    console.error("[admin/competitive/daily] POST", error);
    return NextResponse.json(
      { error: "Failed to generate competitive daily" },
      { status: 500 },
    );
  }
}
