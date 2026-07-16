import { NextResponse } from "next/server";
import { db, dailyUserResults } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cookies } from "next/headers";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";

export async function POST(request: Request) {
  try {
    const rateLimitResult = await checkRateLimit(
      `daily-result:${getClientIp(request)}`,
      1,
      10
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { date, score } = body;
    const fingerprint = request.headers.get("X-Client-Fingerprint") || null;

    if (!date || typeof score !== "number" || score < 0 || score > 10) {
      return NextResponse.json(
        { error: "Invalid date or score" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    let sessionId = cookieStore.get("scrandle_session")?.value;

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      cookieStore.set("scrandle_session", sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    const user = await getCurrentUser();

    const existing = await db
      .select()
      .from(dailyUserResults)
      .where(
        and(
          eq(dailyUserResults.date, date),
          eq(dailyUserResults.sessionId, sessionId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        message: "Score already recorded",
        score: existing[0].score,
      });
    }

    if (user) {
      const byUser = await db
        .select()
        .from(dailyUserResults)
        .where(
          and(
            eq(dailyUserResults.date, date),
            eq(dailyUserResults.userId, user.id)
          )
        )
        .limit(1);
      if (byUser.length > 0) {
        return NextResponse.json({
          message: "Score already recorded",
          score: byUser[0].score,
        });
      }
    }

    await db.insert(dailyUserResults).values({
      date,
      sessionId,
      fingerprintHash: fingerprint,
      score,
      createdAt: new Date(),
      userId: user?.id ?? null,
    });

    return NextResponse.json({
      success: true,
      score,
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "You have already played today" },
        { status: 409 }
      );
    }
    console.error("Error submitting score:", error);
    return NextResponse.json(
      { error: "Failed to submit score" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") || new Date().toISOString().split("T")[0];

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
      ([score, count]) => ({ score, count })
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
      { status: 500 }
    );
  }
}
