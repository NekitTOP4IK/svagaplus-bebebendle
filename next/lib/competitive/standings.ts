/**
 * Shared season ranking query for the competitive hub and day-result screens.
 * Order: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 */

import { asc, desc, eq } from "drizzle-orm";
import { db, users, competitiveStandings } from "@/db/schema";
import { leaderboardLabel } from "./display-name";

export type RankedStanding = Readonly<{
  userId: number;
  points: number;
  daysPlayed: number;
  hits: number;
  label: string;
}>;

/**
 * Compare two standings for rank order.
 * Higher rank (better place) returns negative (sort ascending place).
 * Order: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 */
export function compareStandingsRank(
  a: {
    points: number;
    daysPlayed: number;
    hits: number;
    userId: number;
  },
  b: {
    points: number;
    daysPlayed: number;
    hits: number;
    userId: number;
  },
): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.daysPlayed !== b.daysPlayed) return b.daysPlayed - a.daysPlayed;
  if (a.hits !== b.hits) return b.hits - a.hits;
  return a.userId - b.userId;
}

export async function getSeasonRanking(
  seasonId: number,
): Promise<RankedStanding[]> {
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
    );

  // Defensive sort in case DB collation differs (matches endSeason order).
  return [...standingRows].sort(compareStandingsRank).map((row) => ({
    userId: row.userId,
    points: row.points,
    daysPlayed: row.daysPlayed,
    hits: row.hits,
    label: leaderboardLabel({
      id: row.userId,
      competitiveDisplayName: row.competitiveDisplayName,
      telegramUsername: row.telegramUsername,
    }),
  }));
}
