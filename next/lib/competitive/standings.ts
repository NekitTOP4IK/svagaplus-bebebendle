/**
 * Shared season ranking query for the competitive hub and day-result screens.
 * Order: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 */

import { sql } from "drizzle-orm";
import { db } from "@/db/schema";
import { leaderboardLabel } from "./display-name";

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

export type SeasonBoardRow = Readonly<{
  place: number;
  userId: number;
  points: number;
  daysPlayed: number;
  hits: number;
  label: string;
}>;

export type SeasonBoard = Readonly<{
  rows: SeasonBoardRow[];
  myPlace: number | null;
}>;

export async function getSeasonBoard(
  input: Readonly<{
    seasonId: number;
    userId: number;
    topN: number;
    windowRadius: number;
  }>,
): Promise<SeasonBoard> {
  const { seasonId, userId, topN, windowRadius } = input;

  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT s.user_id, s.points, s.days_played, s.hits,
             u.competitive_display_name, u.telegram_username,
             row_number() OVER (
               ORDER BY s.points DESC, s.days_played DESC, s.hits DESC, s.user_id ASC
             )::int AS place
      FROM competitive_standings s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.season_id = ${seasonId}
    ),
    me AS (SELECT place FROM ranked WHERE user_id = ${userId})
    SELECT r.*, (SELECT me.place FROM me) AS my_place
    FROM ranked r
    WHERE r.place <= ${topN}
       OR ((SELECT me.place FROM me) IS NOT NULL
           AND r.place BETWEEN (SELECT me.place FROM me) - ${windowRadius}
                           AND (SELECT me.place FROM me) + ${windowRadius})
    ORDER BY r.place
  `);

  const rows = result.rows as Array<{
    place: number;
    user_id: number;
    points: number;
    days_played: number;
    hits: number;
    competitive_display_name: string | null;
    telegram_username: string | null;
    my_place: number | null;
  }>;

  return {
    rows: rows.map((row) => ({
      place: row.place,
      userId: row.user_id,
      points: row.points,
      daysPlayed: row.days_played,
      hits: row.hits,
      label: leaderboardLabel({
        id: row.user_id,
        competitiveDisplayName: row.competitive_display_name,
        telegramUsername: row.telegram_username,
      }),
    })),
    myPlace: rows[0]?.my_place ?? null,
  };
}
