import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  generateDailyForDate,
  getDailyPreview,
  todayUtcDate,
} from "@/lib/daily-generate";
import { writeAuditLog } from "@/lib/moderation-audit";
import { db, dailyScrandles } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** GET: preview/status for a date + recent calendar */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || todayUtcDate();
    if (!isDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const preview = await getDailyPreview(date);

    const recent = await db
      .select({
        date: dailyScrandles.date,
        rounds: sql<number>`count(*)::int`,
      })
      .from(dailyScrandles)
      .groupBy(dailyScrandles.date)
      .orderBy(desc(dailyScrandles.date))
      .limit(60);

    return NextResponse.json({ ...preview, calendar: recent });
  } catch (error) {
    console.error("[admin/daily] GET failed", error);
    return NextResponse.json({ error: "Failed to load daily status" }, { status: 500 });
  }
}

/** POST: generate daily for date (admin only) */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const date = body.date || todayUtcDate();
    if (!isDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await generateDailyForDate(date);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "daily.generate",
      details: JSON.stringify({ date, rounds: result.rounds.length }),
    });

    return NextResponse.json({
      message: "Daily created",
      date: result.date,
      rounds: result.rounds,
    });
  } catch (error) {
    console.error("[admin/daily] POST failed", error);
    return NextResponse.json({ error: "Failed to generate daily" }, { status: 500 });
  }
}
