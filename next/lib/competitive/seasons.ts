/**
 * Competitive seasons: CRUD, time-based transitions, final rank snapshot.
 */

import { and, asc, desc, eq, gt, lte, ne } from "drizzle-orm";
import {
  db,
  users,
  competitiveSeasons,
  competitiveStandings,
  competitiveSeasonFinalRanks,
  type CompetitiveSeason,
} from "@/db/schema";
import { leaderboardLabel } from "./display-name";

export type SeasonStatus = "draft" | "countdown" | "active" | "ended";

export type Season = CompetitiveSeason;

export type CreateSeasonInput = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  status?: SeasonStatus;
  themeKey?: string | null;
  themeConfig?: unknown;
};

export type UpdateSeasonPatch = {
  name?: string;
  startsAt?: Date;
  endsAt?: Date;
  status?: SeasonStatus;
  themeKey?: string | null;
  themeConfig?: unknown;
};

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "countdown",
  "active",
  "ended",
]);

/** Pure: countdown season becomes active when now reaches startsAt. */
export function shouldActivate(
  season: { status: string; startsAt: Date },
  now: Date,
): boolean {
  return season.status === "countdown" && now.getTime() >= season.startsAt.getTime();
}

/** Pure: active season ends when now reaches endsAt (half-open [starts, ends)). */
export function shouldEnd(
  season: { status: string; endsAt: Date },
  now: Date,
): boolean {
  return season.status === "active" && now.getTime() >= season.endsAt.getTime();
}

/**
 * Display name for final-rank snapshot:
 * competitiveDisplayName → @telegramUsername → Игрок #{id}
 * (same chain as leaderboardLabel)
 */
export function snapshotDisplayName(user: {
  id: number;
  competitiveDisplayName: string | null;
  telegramUsername: string | null;
}): string {
  return leaderboardLabel(user);
}

function assertValidStatus(status: string): asserts status is SeasonStatus {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid season status: ${status}`);
  }
}

function assertValidWindow(startsAt: Date, endsAt: Date): void {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    throw new Error("startsAt must be a valid Date");
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    throw new Error("endsAt must be a valid Date");
  }
  if (startsAt.getTime() >= endsAt.getTime()) {
    throw new Error("startsAt must be before endsAt");
  }
}

/**
 * Reject if another season is already `active` (ops invariant: at most one active).
 */
export async function assertSingleActive(
  status: SeasonStatus | string,
  excludeId?: number,
): Promise<void> {
  if (status !== "active") return;

  const conditions = [eq(competitiveSeasons.status, "active")];
  if (excludeId !== undefined) {
    conditions.push(ne(competitiveSeasons.id, excludeId));
  }

  const [existing] = await db
    .select({ id: competitiveSeasons.id })
    .from(competitiveSeasons)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new Error(
      `Only one active season is allowed (existing id=${existing.id})`,
    );
  }
}

export async function createSeason(
  input: CreateSeasonInput,
): Promise<Season> {
  const name = input.name.trim();
  if (!name) throw new Error("name is required");

  assertValidWindow(input.startsAt, input.endsAt);

  const status: SeasonStatus = input.status ?? "draft";
  assertValidStatus(status);
  await assertSingleActive(status);

  const values: {
    name: string;
    startsAt: Date;
    endsAt: Date;
    status: SeasonStatus;
    themeKey?: string | null;
    themeConfig?: unknown;
  } = {
    name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status,
  };
  if (input.themeKey !== undefined) values.themeKey = input.themeKey;
  if (input.themeConfig !== undefined) values.themeConfig = input.themeConfig;

  const [row] = await db.insert(competitiveSeasons).values(values).returning();
  if (!row) throw new Error("createSeason: insert did not return a row");
  return row;
}

export async function updateSeason(
  id: number,
  patch: UpdateSeasonPatch,
): Promise<Season | null> {
  const set: {
    updatedAt: Date;
    name?: string;
    startsAt?: Date;
    endsAt?: Date;
    status?: SeasonStatus;
    themeKey?: string | null;
    themeConfig?: unknown;
  } = { updatedAt: new Date() };

  if (typeof patch.name === "string") {
    const name = patch.name.trim();
    if (!name) throw new Error("name is required");
    set.name = name;
  }
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
  if (patch.status !== undefined) {
    assertValidStatus(patch.status);
    set.status = patch.status;
  }
  if (patch.themeKey !== undefined) set.themeKey = patch.themeKey;
  if (patch.themeConfig !== undefined) set.themeConfig = patch.themeConfig;

  // Validate window if either bound changes (need both for comparison).
  if (patch.startsAt !== undefined || patch.endsAt !== undefined) {
    const current = await getSeason(id);
    if (!current) return null;
    const startsAt = patch.startsAt ?? current.startsAt;
    const endsAt = patch.endsAt ?? current.endsAt;
    assertValidWindow(startsAt, endsAt);
  }

  if (patch.status === "active") {
    await assertSingleActive("active", id);
  }

  // Ending via status patch uses full endSeason (snapshot ranks).
  // Apply non-status fields first, then end + snapshot.
  if (patch.status === "ended") {
    const { status: _status, ...withoutStatus } = set;
    void _status;
    const hasOtherFields = Object.keys(withoutStatus).some((k) => k !== "updatedAt");
    if (hasOtherFields) {
      await db
        .update(competitiveSeasons)
        .set(withoutStatus)
        .where(eq(competitiveSeasons.id, id));
    }
    await endSeason(id);
    return getSeason(id);
  }

  const [row] = await db
    .update(competitiveSeasons)
    .set(set)
    .where(eq(competitiveSeasons.id, id))
    .returning();
  return row ?? null;
}

export async function listSeasons(): Promise<Season[]> {
  return db
    .select()
    .from(competitiveSeasons)
    .orderBy(desc(competitiveSeasons.startsAt), desc(competitiveSeasons.id));
}

export async function getSeason(id: number): Promise<Season | null> {
  const [row] = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Season currently open for play: status `active` and now in [startsAt, endsAt).
 */
export async function getPlayableSeason(
  now: Date = new Date(),
): Promise<Season | null> {
  const [row] = await db
    .select()
    .from(competitiveSeasons)
    .where(
      and(
        eq(competitiveSeasons.status, "active"),
        lte(competitiveSeasons.startsAt, now),
        gt(competitiveSeasons.endsAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Prefer active, else countdown, else latest ended (for hub visibility).
 * Prefer in-window active when `now` is provided (default: current time).
 */
export async function getVisibleSeason(
  now: Date = new Date(),
): Promise<Season | null> {
  // Prefer playable window when possible; fall back to any active.
  const playable = await getPlayableSeason(now);
  if (playable) return playable;

  const [active] = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "active"))
    .orderBy(desc(competitiveSeasons.startsAt))
    .limit(1);
  if (active) return active;

  const [countdown] = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "countdown"))
    .orderBy(asc(competitiveSeasons.startsAt))
    .limit(1);
  if (countdown) return countdown;

  const [ended] = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "ended"))
    .orderBy(desc(competitiveSeasons.endsAt), desc(competitiveSeasons.id))
    .limit(1);
  return ended ?? null;
}

/**
 * Time-driven transitions (month handoff-safe order):
 * 1. End actives past endsAt (frees single-active slot)
 * 2. Activate countdowns past startsAt (assertSingleActive)
 * 3. End actives again (overdue countdown that became active and is already past endsAt)
 *
 * - countdown → active when now >= startsAt
 * - active → ended when now >= endsAt (via endSeason)
 */
export async function transitionSeasonsByTime(
  now: Date = new Date(),
): Promise<{ activated: number; ended: number }> {
  let activated = 0;
  let ended = 0;

  // 1. End overdue actives first so the next season can claim the active slot.
  const activeRowsFirst = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "active"));

  for (const season of activeRowsFirst) {
    if (!shouldEnd(season, now)) continue;
    await endSeason(season.id);
    ended += 1;
  }

  // 2. Activate due countdowns (at most one active; assert before write).
  const countdownRows = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "countdown"));

  for (const season of countdownRows) {
    if (!shouldActivate(season, now)) continue;
    await assertSingleActive("active");
    const [updated] = await db
      .update(competitiveSeasons)
      .set({ status: "active", updatedAt: now })
      .where(
        and(
          eq(competitiveSeasons.id, season.id),
          eq(competitiveSeasons.status, "countdown"),
        ),
      )
      .returning({ id: competitiveSeasons.id });
    if (updated) activated += 1;
  }

  // 3. End again: a countdown that was fully past may activate and already be overdue.
  const activeRowsSecond = await db
    .select()
    .from(competitiveSeasons)
    .where(eq(competitiveSeasons.status, "active"));

  for (const season of activeRowsSecond) {
    if (!shouldEnd(season, now)) continue;
    await endSeason(season.id);
    ended += 1;
  }

  return { activated, ended };
}

/**
 * Mark season ended and snapshot standings into competitive_season_final_ranks.
 * Ordering: points DESC, daysPlayed DESC, hits DESC, userId ASC.
 * Idempotent if already ended.
 */
export async function endSeason(seasonId: number): Promise<void> {
  const season = await getSeason(seasonId);
  if (!season) {
    throw new Error(`Season not found: ${seasonId}`);
  }
  if (season.status === "ended") {
    return;
  }

  await db.transaction(async (tx) => {
    const standings = await tx
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

    // Clear any partial snapshot (should not exist) then write ranks.
    await tx
      .delete(competitiveSeasonFinalRanks)
      .where(eq(competitiveSeasonFinalRanks.seasonId, seasonId));

    if (standings.length > 0) {
      await tx.insert(competitiveSeasonFinalRanks).values(
        standings.map((row, index) => ({
          seasonId,
          userId: row.userId,
          rank: index + 1,
          points: row.points,
          daysPlayed: row.daysPlayed,
          hits: row.hits,
          displayNameSnapshot: snapshotDisplayName({
            id: row.userId,
            competitiveDisplayName: row.competitiveDisplayName,
            telegramUsername: row.telegramUsername,
          }),
        })),
      );
    }

    await tx
      .update(competitiveSeasons)
      .set({ status: "ended", updatedAt: new Date() })
      .where(eq(competitiveSeasons.id, seasonId));
  });
}
