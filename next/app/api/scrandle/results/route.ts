import { NextResponse } from "next/server";
import { db, scrandleVotes, dailyScrandles, scrans } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { publicScran } from "@/lib/daily-integrity";
import { todayMskDate } from "@/lib/daily-timezone";

/**
 * Legacy post-game results. Correctness / % only for rounds this session voted.
 * Never returns raw likes/dislikes (would spoil unplayed rounds).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayMskDate();

    const cookieStore = await cookies();
    const sessionId = cookieStore.get("scrandle_session")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { error: "No game session found" },
        { status: 404 },
      );
    }

    const todayScrandles = await db
      .select()
      .from(dailyScrandles)
      .where(eq(dailyScrandles.date, date));

    if (todayScrandles.length === 0) {
      return NextResponse.json(
        { error: "No scrandles found for today" },
        { status: 404 },
      );
    }

    const userVotes = await db
      .select()
      .from(scrandleVotes)
      .where(
        and(
          eq(scrandleVotes.sessionId, sessionId),
          inArray(
            scrandleVotes.dailyScrandleId,
            todayScrandles.map((s) => s.id),
          ),
        ),
      );

    const scranIds = new Set<number>();
    todayScrandles.forEach((s) => {
      scranIds.add(s.scranAId);
      scranIds.add(s.scranBId);
    });

    const allScrans = await db
      .select()
      .from(scrans)
      .where(inArray(scrans.id, Array.from(scranIds)));

    const scransMap = new Map(allScrans.map((s) => [s.id, s]));

    const results = todayScrandles.map((scrandle) => {
      const userVote = userVotes.find((v) => v.dailyScrandleId === scrandle.id);
      const scranA = scransMap.get(scrandle.scranAId);
      const scranB = scransMap.get(scrandle.scranBId);

      if (!scranA || !scranB) {
        throw new Error(`Scran missing for round ${scrandle.roundNumber}`);
      }

      const base = {
        round: scrandle.roundNumber,
        scranA: publicScran(scranA),
        scranB: publicScran(scranB),
        userChoice: userVote?.chosenScranId ?? null,
      };

      // No vote for this round → do not reveal answer or percentages.
      if (!userVote) {
        return {
          ...base,
          correctChoice: null,
          isCorrect: null,
        };
      }

      const scranAPercentage = getLikesPercentage(scranA);
      const scranBPercentage = getLikesPercentage(scranB);
      const correctChoice =
        scranAPercentage > scranBPercentage ? scranA.id : scranB.id;

      return {
        ...base,
        scranA: {
          ...publicScran(scranA),
          likesPercentage: scranAPercentage,
        },
        scranB: {
          ...publicScran(scranB),
          likesPercentage: scranBPercentage,
        },
        correctChoice,
        isCorrect: userVote.chosenScranId === correctChoice,
      };
    });

    const scored = results.filter((r) => r.isCorrect !== null);
    const correctCount = scored.filter((r) => r.isCorrect === true).length;
    const totalRounds = todayScrandles.length;

    return NextResponse.json({
      date,
      score: correctCount,
      totalRounds,
      votedRounds: scored.length,
      percentage:
        scored.length > 0
          ? Math.round((correctCount / scored.length) * 100)
          : 0,
      results,
    });
  } catch (error) {
    console.error("Error fetching results:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 },
    );
  }
}

function getLikesPercentage(scran: {
  numberOfLikes: number;
  numberOfDislikes: number;
}): number {
  const total = scran.numberOfLikes + scran.numberOfDislikes;
  if (total === 0) return 50;
  return Math.round((scran.numberOfLikes / total) * 100);
}
