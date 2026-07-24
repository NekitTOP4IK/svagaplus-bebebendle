import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  competitiveDailies,
  competitiveRounds,
  scrans,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import {
  getPresentationPepper,
  presentationSeed,
  presentRounds,
} from "@/lib/competitive/presentation";
import {
  deltaPp,
  roundPotentialPoints,
} from "@/lib/competitive/scoring";
import { ensureSeasonTransitions } from "@/lib/competitive/seasons";
import { publicScran } from "@/lib/daily-integrity";
import { todayMskDate } from "@/lib/daily-timezone";

export async function GET(_request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isCompetitiveEnabled())) {
    return NextResponse.json(
      { error: "Competitive mode is disabled" },
      { status: 403 },
    );
  }

  try {
    await ensureSeasonTransitions();

    // Players may only load today's competitive daily (ignore client ?date=).
    const date = todayMskDate();

    const [daily] = await db
      .select({
        id: competitiveDailies.id,
        date: competitiveDailies.date,
      })
      .from(competitiveDailies)
      .where(eq(competitiveDailies.date, date))
      .limit(1);

    if (!daily) {
      return NextResponse.json(
        { error: "No competitive daily for this date" },
        { status: 404 },
      );
    }

    const roundsRows = await db
      .select()
      .from(competitiveRounds)
      .where(eq(competitiveRounds.dailyId, daily.id))
      .orderBy(asc(competitiveRounds.roundNumber));

    if (roundsRows.length === 0) {
      return NextResponse.json(
        { error: "No competitive daily for this date" },
        { status: 404 },
      );
    }

    const seed = presentationSeed(
      getPresentationPepper(),
      user.id,
      daily.date,
      daily.id,
    );
    const presented = presentRounds(
      roundsRows.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        scranAId: r.scranAId,
        scranBId: r.scranBId,
        likesA: r.likesA,
        dislikesA: r.dislikesA,
        likesB: r.likesB,
        dislikesB: r.dislikesB,
      })),
      seed,
    );

    const scranIds = new Set<number>();
    for (const round of presented) {
      scranIds.add(round.scranAId);
      scranIds.add(round.scranBId);
    }

    const scranList = await db
      .select()
      .from(scrans)
      .where(inArray(scrans.id, [...scranIds]));

    const scransMap = new Map(scranList.map((s) => [s.id, s]));

    const rounds = presented.map((p) => {
      const scranA = scransMap.get(p.scranAId);
      const scranB = scransMap.get(p.scranBId);
      if (!scranA || !scranB) {
        throw new Error(
          `Scran not found for competitive round id=${p.roundId}`,
        );
      }

      // Delta is absolute — same whether sides are flipped.
      const potentialPoints = roundPotentialPoints(
        deltaPp(p.likesA, p.dislikesA, p.likesB, p.dislikesB),
      );

      return {
        displayRoundNumber: p.displayRoundNumber,
        roundId: p.roundId,
        roundNumber: p.roundNumber, // canonical DB (legacy/debug)
        potentialPoints,
        scranA: publicScran(scranA),
        scranB: publicScran(scranB),
        // intentionally no likes/dislikes; potentialPoints is an accepted difficulty signal
      };
    });

    return NextResponse.json({
      date: daily.date,
      totalRounds: rounds.length,
      rounds,
    });
  } catch (error) {
    console.error(
      "[competitive-daily] failed",
      { userId: user.id },
      error,
    );
    return NextResponse.json(
      { error: "Failed to load competitive daily" },
      { status: 500 },
    );
  }
}
