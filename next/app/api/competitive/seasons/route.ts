import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { listEndedSeasonSummaries } from "@/lib/competitive/archive";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";

/**
 * GET /api/competitive/seasons — ended season summaries for the player archive.
 * Auth required. Feature flag off → 403.
 */
export async function GET() {
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
    const seasons = await listEndedSeasonSummaries(user.id);
    return NextResponse.json({ seasons });
  } catch (error) {
    console.error(
      "[competitive-seasons] list failed",
      { userId: user.id },
      error,
    );
    return NextResponse.json(
      { error: "Failed to load seasons archive" },
      { status: 500 },
    );
  }
}
