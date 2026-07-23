/**
 * Competitive hub payload assembly for GET /api/competitive/hub and hub page.
 *
 * Streak is UI-only (consecutive MSK dates with results ending today or yesterday).
 * Ranking order: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 */

import { asc, desc, eq } from "drizzle-orm";
import {
  db,
  users,
  competitiveDailies,
  competitiveResults,
  competitiveStandings,
} from "@/db/schema";
import {
  mskDateStartUtc,
  nextMidnightMsk,
  todayMskDate,
} from "@/lib/daily-timezone";
import { leaderboardLabel } from "./display-name";
import { isCompetitiveEnabled } from "./feature";
import { getUserResult } from "./play";
import { getVisibleSeason, type Season, type SeasonStatus } from "./seasons";

const TOP_LIMIT = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HubSeasonSummary = Readonly<{
  id: number;
  name: string;
  status: SeasonStatus;
  startsAt: string;
  endsAt: string;
  themeKey: string | null;
  themeConfig: unknown;
}>;

export type HubStandingRow = Readonly<{
  place: number;
  userId: number;
  points: number;
  daysPlayed: number;
  hits: number;
  label: string;
  isMe: boolean;
}>;

export type HubMe = Readonly<{
  place: number | null;
  points: number;
  daysPlayed: number;
  hits: number;
  streakDays: number;
  label: string;
  competitiveDisplayName: string | null;
}>;

export type HubPayload = Readonly<{
  enabled: boolean;
  season: HubSeasonSummary | null;
  hasDailyToday: boolean;
  hasPlayed: boolean;
  todayPoints: number | null;
  me: HubMe;
  top: HubStandingRow[];
  /** Present when the current user has a standing outside the top 50. */
  myRow: HubStandingRow | null;
  countdowns: Readonly<{
    seasonEndsAt: string | null;
    nextDailyAt: string;
  }>;
}>;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested via display-name / hub consumers)
// ---------------------------------------------------------------------------

/**
 * Add calendar days to a YYYY-MM-DD string (date-only math, no TZ shift).
 */
export function addCalendarDays(dateStr: string, delta: number): string {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 1-based day index of the season for a given MSK calendar day.
 * Day 1 = MSK date of season startsAt.
 */
export function seasonDayNumber(
  seasonStartsAt: Date | string,
  todayMsk: string = todayMskDate(),
): number {
  const start =
    typeof seasonStartsAt === "string"
      ? new Date(seasonStartsAt)
      : seasonStartsAt;
  const startMsk = todayMskDate(start);
  const a = mskDateStartUtc(startMsk).getTime();
  const b = mskDateStartUtc(todayMsk).getTime();
  const days = Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, days);
}

/**
 * Consecutive MSK calendar dates with a result, ending on today or yesterday.
 * UI-only streak (no points). Returns 0 if neither today nor yesterday has a result.
 */
export function computeStreakDays(
  resultDates: readonly string[],
  todayMsk: string,
): number {
  const set = new Set(resultDates);
  let cursor: string;
  if (set.has(todayMsk)) {
    cursor = todayMsk;
  } else {
    const yesterday = addCalendarDays(todayMsk, -1);
    if (set.has(yesterday)) {
      cursor = yesterday;
    } else {
      return 0;
    }
  }

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addCalendarDays(cursor, -1);
  }
  return streak;
}

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

function seasonSummary(season: Season): HubSeasonSummary {
  return {
    id: season.id,
    name: season.name,
    status: season.status as SeasonStatus,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    themeKey: season.themeKey,
    themeConfig: season.themeConfig,
  };
}

function emptyMe(label: string, competitiveDisplayName: string | null): HubMe {
  return {
    place: null,
    points: 0,
    daysPlayed: 0,
    hits: 0,
    streakDays: 0,
    label,
    competitiveDisplayName,
  };
}

// ---------------------------------------------------------------------------
// Hub assembly
// ---------------------------------------------------------------------------

/**
 * Assemble hub payload for a logged-in user.
 * When the feature flag is off, returns `enabled: false` with empty season board.
 */
export async function getHubPayload(
  userId: number,
  now: Date = new Date(),
): Promise<HubPayload> {
  const enabled = await isCompetitiveEnabled();
  const today = todayMskDate(now);
  const nextDailyAt = nextMidnightMsk(now).toISOString();

  const [user] = await db
    .select({
      id: users.id,
      competitiveDisplayName: users.competitiveDisplayName,
      telegramUsername: users.telegramUsername,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const label = user
    ? leaderboardLabel(user)
    : `Игрок #${userId}`;
  const competitiveDisplayName = user?.competitiveDisplayName ?? null;

  if (!enabled) {
    return {
      enabled: false,
      season: null,
      hasDailyToday: false,
      hasPlayed: false,
      todayPoints: null,
      me: emptyMe(label, competitiveDisplayName),
      top: [],
      myRow: null,
      countdowns: {
        seasonEndsAt: null,
        nextDailyAt,
      },
    };
  }

  const season = await getVisibleSeason(now);

  const [dailyRow] = await db
    .select({ id: competitiveDailies.id })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.date, today))
    .limit(1);
  const hasDailyToday = dailyRow !== undefined;

  const todayResult = await getUserResult(userId, today);
  const hasPlayed = todayResult !== null;
  const todayPoints = todayResult?.points ?? null;

  // Streak: all competitive results for this user (UI continuity, not season-scoped).
  const resultDateRows = await db
    .select({ date: competitiveResults.date })
    .from(competitiveResults)
    .where(eq(competitiveResults.userId, userId));
  const streakDays = computeStreakDays(
    resultDateRows.map((r) => r.date),
    today,
  );

  if (!season) {
    return {
      enabled: true,
      season: null,
      hasDailyToday,
      hasPlayed,
      todayPoints,
      me: {
        ...emptyMe(label, competitiveDisplayName),
        streakDays,
      },
      top: [],
      myRow: null,
      countdowns: {
        seasonEndsAt: null,
        nextDailyAt,
      },
    };
  }

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
    .where(eq(competitiveStandings.seasonId, season.id))
    .orderBy(
      desc(competitiveStandings.points),
      desc(competitiveStandings.daysPlayed),
      desc(competitiveStandings.hits),
      asc(competitiveStandings.userId),
    );

  // Defensive sort in case DB collation differs (matches endSeason order).
  const ranked = [...standingRows].sort(compareStandingsRank);

  const top: HubStandingRow[] = ranked.slice(0, TOP_LIMIT).map((row, index) => ({
    place: index + 1,
    userId: row.userId,
    points: row.points,
    daysPlayed: row.daysPlayed,
    hits: row.hits,
    label: leaderboardLabel({
      id: row.userId,
      competitiveDisplayName: row.competitiveDisplayName,
      telegramUsername: row.telegramUsername,
    }),
    isMe: row.userId === userId,
  }));

  const myIndex = ranked.findIndex((r) => r.userId === userId);
  let me: HubMe;
  let myRow: HubStandingRow | null = null;

  if (myIndex >= 0) {
    const row = ranked[myIndex]!;
    const place = myIndex + 1;
    me = {
      place,
      points: row.points,
      daysPlayed: row.daysPlayed,
      hits: row.hits,
      streakDays,
      label,
      competitiveDisplayName,
    };
    if (place > TOP_LIMIT) {
      myRow = {
        place,
        userId: row.userId,
        points: row.points,
        daysPlayed: row.daysPlayed,
        hits: row.hits,
        label,
        isMe: true,
      };
    }
  } else {
    me = {
      place: null,
      points: 0,
      daysPlayed: 0,
      hits: 0,
      streakDays,
      label,
      competitiveDisplayName,
    };
  }

  return {
    enabled: true,
    season: seasonSummary(season),
    hasDailyToday,
    hasPlayed,
    todayPoints,
    me,
    top,
    myRow,
    countdowns: {
      seasonEndsAt: season.endsAt.toISOString(),
      nextDailyAt,
    },
  };
}
