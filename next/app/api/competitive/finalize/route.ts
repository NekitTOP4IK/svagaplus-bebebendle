import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import { finalizeCompetitive } from "@/lib/competitive/play";
import { todayMskDate } from "@/lib/daily-timezone";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(
    `competitive-finalize:${user.id}`,
    5,
    60,
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 },
    );
  }

  let body: { date?: unknown } = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text) as { date?: unknown };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : todayMskDate();

  try {
    // isCompetitiveEnabled checked inside finalizeCompetitive
    const result = await finalizeCompetitive({
      userId: user.id,
      date,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      hits: result.hits,
      points: result.points,
    });
  } catch (error) {
    console.error(
      "[competitive-finalize] failed",
      { userId: user.id, date },
      error,
    );
    return NextResponse.json(
      { error: "Failed to finalize competitive day" },
      { status: 500 },
    );
  }
}
