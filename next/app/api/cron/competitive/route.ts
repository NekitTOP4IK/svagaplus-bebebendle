import { NextResponse } from "next/server";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { generateCompetitiveDaily } from "@/lib/competitive/generate";
import {
  getPlayableSeason,
  transitionSeasonsByTime,
} from "@/lib/competitive/seasons";
import { todayMskDate } from "@/lib/daily-timezone";

/**
 * Cron: season time transitions + competitive daily generation (MSK today).
 * Auth: Authorization: Bearer ${CRON_SECRET} (same as casual daily cron).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!(await isCompetitiveEnabled())) {
      return NextResponse.json({ skipped: true, reason: "disabled" });
    }

    const transitions = await transitionSeasonsByTime();
    const date = todayMskDate();
    const playable = await getPlayableSeason();

    if (!playable) {
      return NextResponse.json({
        skipped: true,
        reason: "no_playable_season",
        date,
        transitions,
      });
    }

    const result = await generateCompetitiveDaily(date);

    if (!result.ok) {
      // Already generated for today — treat as success (idempotent cron).
      if (result.status === 409) {
        return NextResponse.json({
          message: "Competitive daily already exists for today",
          date,
          seasonId: playable.id,
          transitions,
          alreadyExists: true,
        });
      }
      return NextResponse.json(
        {
          error: result.error,
          date,
          seasonId: playable.id,
          transitions,
        },
        { status: result.status },
      );
    }

    console.log(
      `[cron/competitive] created daily id=${result.dailyId} date=${date}`,
    );
    return NextResponse.json({
      message: "Competitive daily created successfully",
      date,
      dailyId: result.dailyId,
      seasonId: playable.id,
      transitions,
    });
  } catch (error) {
    console.error("[cron/competitive] failed", error);
    return NextResponse.json(
      { error: "Failed to run competitive cron" },
      { status: 500 },
    );
  }
}
