/**
 * Player season archive: ended-season summaries and final-rank detail.
 * Source of truth for ranks: competitive_season_final_ranks (frozen at endSeason).
 */

import { asc, eq } from "drizzle-orm";
import {
  db,
  competitiveSeasonFinalRanks,
  type CompetitiveSeason,
} from "@/db/schema";
import { getSeason, listEndedSeasons } from "./seasons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EndedSeasonSummary = Readonly<{
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  themeKey: string | null;
  /** Final place for the requesting user, if they have a rank row. */
  myPlace: number | null;
}>;

export type ArchiveRankRow = Readonly<{
  place: number;
  userId: number;
  points: number;
  daysPlayed: number;
  label: string;
  isMe: boolean;
}>;

export type EndedSeasonDetail = Readonly<{
  season: Readonly<{
    id: number;
    name: string;
    startsAt: string;
    endsAt: string;
    themeKey: string | null;
    status: "ended";
  }>;
  ranks: ArchiveRankRow[];
  me: Readonly<{
    place: number;
    points: number;
    daysPlayed: number;
    label: string;
  }> | null;
}>;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Safe theme modifier class for archive cards.
 * Only alphanumerics, underscore, hyphen → `c-season-card--{key}`; else null.
 */
export function safeThemeCardClass(
  themeKey: string | null | undefined,
): string | null {
  if (!themeKey) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(themeKey)) return null;
  return `c-season-card--${themeKey}`;
}

function seasonMeta(season: CompetitiveSeason): EndedSeasonDetail["season"] {
  return {
    id: season.id,
    name: season.name,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    themeKey: season.themeKey,
    status: "ended",
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Ended seasons newest-first, with optional myPlace from final ranks.
 */
export async function listEndedSeasonSummaries(
  userId: number,
): Promise<EndedSeasonSummary[]> {
  const seasons = await listEndedSeasons();
  if (seasons.length === 0) return [];

  const myRanks = await db
    .select({
      seasonId: competitiveSeasonFinalRanks.seasonId,
      rank: competitiveSeasonFinalRanks.rank,
    })
    .from(competitiveSeasonFinalRanks)
    .where(eq(competitiveSeasonFinalRanks.userId, userId));

  const placeBySeason = new Map(
    myRanks.map((r) => [r.seasonId, r.rank] as const),
  );

  return seasons.map((s) => ({
    id: s.id,
    name: s.name,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    themeKey: s.themeKey,
    myPlace: placeBySeason.get(s.id) ?? null,
  }));
}

/**
 * Final ranks for an ended season. Returns null if missing or not ended.
 */
export async function getEndedSeasonDetail(
  seasonId: number,
  userId: number,
): Promise<EndedSeasonDetail | null> {
  const season = await getSeason(seasonId);
  if (!season || season.status !== "ended") {
    return null;
  }

  const rankRows = await db
    .select({
      userId: competitiveSeasonFinalRanks.userId,
      rank: competitiveSeasonFinalRanks.rank,
      points: competitiveSeasonFinalRanks.points,
      daysPlayed: competitiveSeasonFinalRanks.daysPlayed,
      displayNameSnapshot: competitiveSeasonFinalRanks.displayNameSnapshot,
    })
    .from(competitiveSeasonFinalRanks)
    .where(eq(competitiveSeasonFinalRanks.seasonId, seasonId))
    .orderBy(asc(competitiveSeasonFinalRanks.rank));

  const ranks: ArchiveRankRow[] = rankRows.map((row) => {
    const label =
      row.displayNameSnapshot?.trim() || `Игрок #${row.userId}`;
    return {
      place: row.rank,
      userId: row.userId,
      points: row.points,
      daysPlayed: row.daysPlayed,
      label,
      isMe: row.userId === userId,
    };
  });

  const myRow = ranks.find((r) => r.isMe) ?? null;
  const me = myRow
    ? {
        place: myRow.place,
        points: myRow.points,
        daysPlayed: myRow.daysPlayed,
        label: myRow.label,
      }
    : null;

  return {
    season: seasonMeta(season),
    ranks,
    me,
  };
}
