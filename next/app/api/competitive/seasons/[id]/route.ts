import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getEndedSeasonDetail } from "@/lib/competitive/archive";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/competitive/seasons/[id] — ended season final ranks.
 * Auth required. 404 if missing or not ended. Feature flag off → 403.
 */
export async function GET(_request: Request, context: RouteContext) {
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

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid season id" }, { status: 400 });
  }

  try {
    const detail = await getEndedSeasonDetail(id, user.id);
    if (!detail) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error(
      "[competitive-seasons] detail failed",
      { userId: user.id, seasonId: id },
      error,
    );
    return NextResponse.json(
      { error: "Failed to load season" },
      { status: 500 },
    );
  }
}
