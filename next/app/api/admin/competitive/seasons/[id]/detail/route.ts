import { NextResponse } from "next/server";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  users,
  scrans,
  competitiveDailies,
  competitiveRounds,
  competitiveStandings,
  competitiveSeasonFinalRanks,
} from "@/db/schema";
import { requireRole } from "@/lib/auth-server";
import { leaderboardLabel } from "@/lib/competitive/display-name";
import { getSeason } from "@/lib/competitive/seasons";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type RankRow = {
  rank: number;
  userId: number;
  displayNameSnapshot: string | null;
  points: number;
  daysPlayed: number;
  hits: number;
};

type ScranPublic = {
  id: number;
  name: string;
  imageUrl: string;
};

type RoundDetail = {
  roundNumber: number;
  scranA: ScranPublic;
  scranB: ScranPublic;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
};

type DailyDetail = {
  date: string;
  rounds: RoundDetail[];
};

async function loadFinalRanks(seasonId: number): Promise<RankRow[]> {
  const rows = await db
    .select({
      rank: competitiveSeasonFinalRanks.rank,
      userId: competitiveSeasonFinalRanks.userId,
      displayNameSnapshot: competitiveSeasonFinalRanks.displayNameSnapshot,
      points: competitiveSeasonFinalRanks.points,
      daysPlayed: competitiveSeasonFinalRanks.daysPlayed,
      hits: competitiveSeasonFinalRanks.hits,
    })
    .from(competitiveSeasonFinalRanks)
    .where(eq(competitiveSeasonFinalRanks.seasonId, seasonId))
    .orderBy(asc(competitiveSeasonFinalRanks.rank));

  return rows.map((r) => ({
    rank: r.rank,
    userId: r.userId,
    displayNameSnapshot: r.displayNameSnapshot,
    points: r.points,
    daysPlayed: r.daysPlayed,
    hits: r.hits,
  }));
}

async function loadLiveStandings(seasonId: number): Promise<RankRow[]> {
  const rows = await db
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
    );

  // Defensive sort matching endSeason / hub ranking.
  const ranked = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.daysPlayed !== a.daysPlayed) return b.daysPlayed - a.daysPlayed;
    if (b.hits !== a.hits) return b.hits - a.hits;
    return a.userId - b.userId;
  });

  return ranked.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    displayNameSnapshot: leaderboardLabel({
      id: row.userId,
      competitiveDisplayName: row.competitiveDisplayName,
      telegramUsername: row.telegramUsername,
    }),
    points: row.points,
    daysPlayed: row.daysPlayed,
    hits: row.hits,
  }));
}

async function loadDailies(seasonId: number): Promise<DailyDetail[]> {
  const dailies = await db
    .select({
      id: competitiveDailies.id,
      date: competitiveDailies.date,
    })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.seasonId, seasonId))
    .orderBy(asc(competitiveDailies.date));

  if (dailies.length === 0) return [];

  const dailyIds = dailies.map((d) => d.id);
  const roundRows = await db
    .select({
      dailyId: competitiveRounds.dailyId,
      roundNumber: competitiveRounds.roundNumber,
      scranAId: competitiveRounds.scranAId,
      scranBId: competitiveRounds.scranBId,
      likesA: competitiveRounds.likesA,
      dislikesA: competitiveRounds.dislikesA,
      likesB: competitiveRounds.likesB,
      dislikesB: competitiveRounds.dislikesB,
    })
    .from(competitiveRounds)
    .where(inArray(competitiveRounds.dailyId, dailyIds))
    .orderBy(asc(competitiveRounds.roundNumber));

  const scranIds = new Set<number>();
  for (const r of roundRows) {
    scranIds.add(r.scranAId);
    scranIds.add(r.scranBId);
  }

  const scranMap = new Map<number, ScranPublic>();
  if (scranIds.size > 0) {
    const scranList = await db
      .select({
        id: scrans.id,
        name: scrans.name,
        imageUrl: scrans.imageUrl,
      })
      .from(scrans)
      .where(inArray(scrans.id, [...scranIds]));
    for (const s of scranList) {
      scranMap.set(s.id, { id: s.id, name: s.name, imageUrl: s.imageUrl });
    }
  }

  const roundsByDaily = new Map<number, RoundDetail[]>();
  for (const r of roundRows) {
    const scranA = scranMap.get(r.scranAId);
    const scranB = scranMap.get(r.scranBId);
    if (!scranA || !scranB) {
      console.warn(
        `[admin/competitive/seasons/detail] missing scran for daily=${r.dailyId} round=${r.roundNumber}`,
      );
      continue;
    }
    const list = roundsByDaily.get(r.dailyId) ?? [];
    list.push({
      roundNumber: r.roundNumber,
      scranA,
      scranB,
      likesA: r.likesA,
      dislikesA: r.dislikesA,
      likesB: r.likesB,
      dislikesB: r.dislikesB,
    });
    roundsByDaily.set(r.dailyId, list);
  }

  return dailies.map((d) => ({
    date: d.date,
    rounds: roundsByDaily.get(d.id) ?? [],
  }));
}

/**
 * GET — admin season inspect: ranks + per-day rounds (frozen likes).
 * Admin only. Not for public player APIs.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const season = await getSeason(id);
    if (!season) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ended → final ranks. Active/other → live standings; if empty, fall back to final.
    let finalRanks: RankRow[];
    if (season.status === "ended") {
      finalRanks = await loadFinalRanks(id);
    } else {
      finalRanks = await loadLiveStandings(id);
      if (finalRanks.length === 0) {
        finalRanks = await loadFinalRanks(id);
      }
    }

    const dailies = await loadDailies(id);

    return NextResponse.json({
      season: {
        id: season.id,
        name: season.name,
        status: season.status,
        startsAt: season.startsAt.toISOString(),
        endsAt: season.endsAt.toISOString(),
        themeKey: season.themeKey,
      },
      finalRanks,
      dailies,
    });
  } catch (error) {
    console.error("[admin/competitive/seasons/detail] GET", error);
    return NextResponse.json(
      { error: "Failed to load season detail" },
      { status: 500 },
    );
  }
}
