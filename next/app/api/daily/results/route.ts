import { NextResponse } from "next/server";
import { db, dailyUserResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import {
  computeAndStoreDailyResult,
  resolvePlaySessionId,
} from "@/lib/daily-integrity";
import { todayMskDate } from "@/lib/daily-timezone";

export async function POST(request: Request) {
  try {
    const rateLimitResult = await checkRateLimit(
      `daily-result:${getClientIp(request)}`,
      1,
      10,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      score?: number;
    };
    const fingerprint = request.headers.get("X-Client-Fingerprint") || null;
    const date = body.date;
    const clientIp = getClientIp(request);

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Client score is ignored — integrity from scrandle_votes
    const sessionId = resolvePlaySessionId(fingerprint, clientIp);
    const result = await computeAndStoreDailyResult({
      date,
      sessionId,
      fingerprint,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      success: true,
      score: result.score,
      alreadyPlayed: result.alreadyPlayed ?? false,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "You have already played today" },
        { status: 409 },
      );
    }
    console.error("Error submitting score:", error);
    return NextResponse.json(
      { error: "Failed to submit score" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayMskDate();

    const results = await db
      .select({
        score: dailyUserResults.score,
      })
      .from(dailyUserResults)
      .where(eq(dailyUserResults.date, date));

    if (results.length === 0) {
      return NextResponse.json({
        date,
        totalUsers: 0,
        averageScore: null,
        scoreDistribution: [],
      });
    }

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const averageScore = Math.round((totalScore / results.length) * 10) / 10;

    const distributionMap = new Map<number, number>();
    for (let i = 0; i <= 10; i++) {
      distributionMap.set(i, 0);
    }
    results.forEach((r) => {
      distributionMap.set(r.score, (distributionMap.get(r.score) || 0) + 1);
    });

    const scoreDistribution = Array.from(distributionMap.entries()).map(
      ([score, count]) => ({ score, count }),
    );

    return NextResponse.json({
      date,
      totalUsers: results.length,
      averageScore,
      scoreDistribution,
    });
  } catch (error) {
    console.error("Error fetching results:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 },
    );
  }
}
