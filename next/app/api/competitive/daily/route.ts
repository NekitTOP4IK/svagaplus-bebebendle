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
  deltaPp,
  roundPotentialPoints,
} from "@/lib/competitive/scoring";
import { todayMskDate } from "@/lib/daily-timezone";

/** Public scran shape for competitive play — never includes likes/dislikes. */
function mapPublicScran(s: typeof scrans.$inferSelect) {
  return {
    id: s.id,
    imageUrl: s.imageUrl,
    name: s.name,
    description: s.description,
    price: s.price,
    icon: s.icon ?? "Cooked_Cod.png",
    isSubscriberAtSubmit: s.isSubscriberAtSubmit ?? null,
  };
}

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

    const scranIds = new Set<number>();
    for (const round of roundsRows) {
      scranIds.add(round.scranAId);
      scranIds.add(round.scranBId);
    }

    const scranList = await db
      .select()
      .from(scrans)
      .where(inArray(scrans.id, [...scranIds]));

    const scransMap = new Map(scranList.map((s) => [s.id, s]));

    const rounds = roundsRows.map((round) => {
      const scranA = scransMap.get(round.scranAId);
      const scranB = scransMap.get(round.scranBId);
      if (!scranA || !scranB) {
        throw new Error(
          `Scran not found for competitive round ${round.roundNumber}`,
        );
      }

      const potentialPoints = roundPotentialPoints(
        deltaPp(
          round.likesA,
          round.dislikesA,
          round.likesB,
          round.dislikesB,
        ),
      );

      return {
        roundNumber: round.roundNumber,
        roundId: round.id,
        potentialPoints,
        scranA: mapPublicScran(scranA),
        scranB: mapPublicScran(scranB),
        // intentionally no likes/dislikes
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
