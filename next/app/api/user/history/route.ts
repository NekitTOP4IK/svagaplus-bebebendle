import { NextResponse } from "next/server";
import { db, dailyUserResults, dailyScrandles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import { cookies } from "next/headers";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Join daily_user_results + daily_scrandles (on date) for play history + scores context.
    // Use distinct to avoid row explosion from multiple rounds per date.
    // Also include results by current scrandle_session (for plays before userId was attached or anon sessions).
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("scrandle_session")?.value ?? null;

    const userResults = await db
      .selectDistinct({
        date: dailyUserResults.date,
        score: dailyUserResults.score,
        createdAt: dailyUserResults.createdAt,
      })
      .from(dailyUserResults)
      .leftJoin(
        dailyScrandles,
        eq(dailyScrandles.date, dailyUserResults.date)
      )
      .where(eq(dailyUserResults.userId, user.id))
      .orderBy(desc(dailyUserResults.date))
      .limit(100);

    let sessionResults: typeof userResults = [];
    if (sessionId) {
      sessionResults = await db
        .selectDistinct({
          date: dailyUserResults.date,
          score: dailyUserResults.score,
          createdAt: dailyUserResults.createdAt,
        })
        .from(dailyUserResults)
        .leftJoin(
          dailyScrandles,
          eq(dailyScrandles.date, dailyUserResults.date)
        )
        .where(eq(dailyUserResults.sessionId, sessionId))
        .orderBy(desc(dailyUserResults.date))
        .limit(100);
    }

    // Merge unique by date (prefer userId-backed row if both)
    const byDate = new Map<string, (typeof userResults)[number]>();
    for (const r of [...sessionResults, ...userResults]) {
      if (!byDate.has(r.date)) {
        byDate.set(r.date, r);
      }
    }
    const history = Array.from(byDate.values()).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 100);

    return NextResponse.json({
      history,
    });
  } catch (error) {
    console.error("Error fetching user history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
