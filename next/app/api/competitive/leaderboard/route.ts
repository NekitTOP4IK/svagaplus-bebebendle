import { NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  users,
  competitiveStandings,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { leaderboardLabel } from "@/lib/competitive/display-name";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { getVisibleSeason } from "@/lib/competitive/seasons";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
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
    const { searchParams } = new URL(request.url);

    const limitRaw = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    const offsetRaw = Number(searchParams.get("offset") ?? 0);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitRaw)))
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.floor(offsetRaw))
      : 0;

    let seasonId: number | null = null;
    const seasonIdParam = searchParams.get("seasonId");
    if (seasonIdParam !== null && seasonIdParam !== "") {
      const parsed = Number(seasonIdParam);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: "Invalid seasonId" },
          { status: 400 },
        );
      }
      seasonId = parsed;
    } else {
      const season = await getVisibleSeason();
      seasonId = season?.id ?? null;
    }

    if (seasonId === null) {
      return NextResponse.json({
        seasonId: null,
        total: 0,
        limit,
        offset,
        rows: [],
      });
    }

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competitiveStandings)
      .where(eq(competitiveStandings.seasonId, seasonId));

    const total = countRow?.count ?? 0;

    const standingRows = await db
      .select({
        userId: competitiveStandings.userId,
        points: competitiveStandings.points,
        daysPlayed: competitiveStandings.daysPlayed,
        hits: competitiveStandings.hits,
        competitiveDisplayName: users.competitiveDisplayName,
        telegramUsername: users.telegramUsername,
      })
      .from(competitiveStandings)
      .innerJoin(users, eq(competitiveStandings.userId, users.id))
      .where(eq(competitiveStandings.seasonId, seasonId))
      .orderBy(
        desc(competitiveStandings.points),
        desc(competitiveStandings.daysPlayed),
        desc(competitiveStandings.hits),
        asc(competitiveStandings.userId),
      )
      .limit(limit)
      .offset(offset);

    const rows = standingRows.map((row, index) => ({
      place: offset + index + 1,
      userId: row.userId,
      points: row.points,
      daysPlayed: row.daysPlayed,
      hits: row.hits,
      label: leaderboardLabel({
        id: row.userId,
        competitiveDisplayName: row.competitiveDisplayName,
        telegramUsername: row.telegramUsername,
      }),
      isMe: row.userId === user.id,
    }));

    return NextResponse.json({
      seasonId,
      total,
      limit,
      offset,
      rows,
    });
  } catch (error) {
    console.error(
      "[competitive-leaderboard] failed",
      { userId: user.id },
      error,
    );
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 },
    );
  }
}
