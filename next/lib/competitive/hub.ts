/**
 * Competitive hub payload assembly for GET /api/competitive/hub and hub page.
 *
 * Streak is UI-only (consecutive MSK dates with results ending today or yesterday).
 * Ranking order: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  users,
  competitiveDailies,
  competitiveResults,
  competitiveStandings,
  competitiveStreakFreezes,
} from "@/db/schema";
import {
  mskDateStartUtc,
  nextMidnightMsk,
  todayMskDate,
} from "@/lib/daily-timezone";
import { getSetting } from "@/lib/app-settings";
import {
  SETTING_COMPETITIVE_MODE_RULES,
  emptyContentDoc,
  parseContentDocFromJsonString,
  parseSeasonThemeConfig,
  type CompetitiveContentDoc,
} from "./content";
import { leaderboardLabel } from "./display-name";
import { isCompetitiveEnabled } from "./feature";
import { getUserResult } from "./play";
import {
  ensureSeasonTransitions,
  getLatestEndedSeason,
  getVisibleSeason,
  type Season,
  type SeasonStatus,
} from "./seasons";

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
  /** Freeze charge still available this season (not yet auto-consumed). */
  streakFreezeAvailable: boolean;
  /** Freeze is currently bridging a miss (streak held without playing that day). */
  streakFreezeHolding: boolean;
  label: string;
  competitiveDisplayName: string | null;
}>;

export type HubPreviousEndedSeason = Readonly<{
  id: number;
  name: string;
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
  /**
   * When visible season is countdown and an ended season exists,
   * the latest ended season for topbar «Итоги» CTA.
   */
  previousEndedSeason: HubPreviousEndedSeason | null;
  /** Global mode rules (admin-edited). */
  modeRules: CompetitiveContentDoc;
  /** Season rules from themeConfig.rules */
  seasonRules: CompetitiveContentDoc;
  /** Season rewards from themeConfig.rewards */
  seasonRewards: CompetitiveContentDoc;
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

export type StreakComputeResult = Readonly<{
  days: number;
  /** True if a freeze charge was needed to bridge a single missed day. */
  freezeConsumed: boolean;
}>;

export type ComputeStreakOptions = Readonly<{
  /** One free single-day gap per season. Gap day does not increment streak. */
  freezeAvailable?: boolean;
}>;

/**
 * Consecutive MSK calendar dates with a result, ending on today or yesterday
 * (or day-2 if freeze covers yesterday).
 * UI-only streak (no points). Freeze bridges exactly one empty day and does not
 * count toward `days`.
 */
export function computeStreakDays(
  resultDates: readonly string[],
  todayMsk: string,
  options: ComputeStreakOptions = {},
): StreakComputeResult {
  const set = new Set(resultDates);
  let freezesLeft = options.freezeAvailable ? 1 : 0;
  let freezeConsumed = false;

  let cursor: string | null = null;
  if (set.has(todayMsk)) {
    cursor = todayMsk;
  } else {
    const yesterday = addCalendarDays(todayMsk, -1);
    if (set.has(yesterday)) {
      cursor = yesterday;
    } else if (freezesLeft > 0) {
      const day2 = addCalendarDays(todayMsk, -2);
      if (set.has(day2)) {
        // Yesterday is the freezed miss; chain continues from day-2.
        cursor = day2;
        freezesLeft = 0;
        freezeConsumed = true;
      }
    }
  }

  if (!cursor) {
    return { days: 0, freezeConsumed: false };
  }

  let streak = 0;
  while (true) {
    if (set.has(cursor)) {
      streak += 1;
      cursor = addCalendarDays(cursor, -1);
      continue;
    }
    if (freezesLeft > 0) {
      // Bridge one empty day without incrementing streak.
      freezesLeft = 0;
      freezeConsumed = true;
      cursor = addCalendarDays(cursor, -1);
      if (!set.has(cursor)) break;
      continue;
    }
    break;
  }

  return { days: streak, freezeConsumed };
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
    streakFreezeAvailable: false,
    streakFreezeHolding: false,
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
  await ensureSeasonTransitions(now);

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

  const modeRulesRaw = await getSetting(SETTING_COMPETITIVE_MODE_RULES, "");
  const modeRules = parseContentDocFromJsonString(modeRulesRaw || null);
  const emptyContent = emptyContentDoc();

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
      previousEndedSeason: null,
      modeRules: emptyContent,
      seasonRules: emptyContent,
      seasonRewards: emptyContent,
    };
  }

  const season = await getVisibleSeason(now);

  let previousEndedSeason: HubPreviousEndedSeason | null = null;
  if (season?.status === "countdown") {
    const ended = await getLatestEndedSeason();
    if (ended) {
      previousEndedSeason = { id: ended.id, name: ended.name };
    }
  }

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
  // Freeze charge is season-scoped (standings.streak_freeze_used).
  const resultDateRows = await db
    .select({ date: competitiveResults.date })
    .from(competitiveResults)
    .where(eq(competitiveResults.userId, userId));
  const resultDates = resultDateRows.map((r) => r.date);

  if (!season) {
    const { days: streakDays } = computeStreakDays(resultDates, today);
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
      previousEndedSeason: null,
      modeRules,
      seasonRules: emptyContent,
      seasonRewards: emptyContent,
    };
  }

  const theme = parseSeasonThemeConfig(season.themeConfig);
  const seasonRules = theme.rules ?? emptyContent;
  const seasonRewards = theme.rewards ?? emptyContent;

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

  const [freezeRow] = await db
    .select({ userId: competitiveStreakFreezes.userId })
    .from(competitiveStreakFreezes)
    .where(
      and(
        eq(competitiveStreakFreezes.seasonId, season.id),
        eq(competitiveStreakFreezes.userId, userId),
      ),
    )
    .limit(1);

  const freezeAlreadyUsed = freezeRow !== undefined;

  // Season always grants one freeze capacity: recompute may keep bridging the
  // single historical gap after the charge is spent (does not stack).
  const streakResult = computeStreakDays(resultDates, today, {
    freezeAvailable: true,
  });

  // Persist auto-consume the first time a gap is bridged this season.
  if (streakResult.freezeConsumed && !freezeAlreadyUsed) {
    await db
      .insert(competitiveStreakFreezes)
      .values({
        seasonId: season.id,
        userId,
        usedAt: now,
      })
      .onConflictDoNothing({
        target: [
          competitiveStreakFreezes.seasonId,
          competitiveStreakFreezes.userId,
        ],
      });
  }

  const streakDays = streakResult.days;
  const streakFreezeHolding = streakResult.freezeConsumed;
  const streakFreezeAvailable =
    !freezeAlreadyUsed && !streakResult.freezeConsumed;

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
      streakFreezeAvailable,
      streakFreezeHolding,
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
      streakFreezeAvailable,
      streakFreezeHolding,
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
    previousEndedSeason,
    modeRules,
    seasonRules,
    seasonRewards,
  };
}
