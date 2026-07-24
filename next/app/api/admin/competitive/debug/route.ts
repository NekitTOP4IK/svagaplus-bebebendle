import { eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  competitiveResults,
  competitiveStandings,
  competitiveStreakFreezes,
  competitiveUserPrefs,
  db,
  users,
} from "@/db/schema";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import { resetCompetitiveModalPrefs } from "@/lib/competitive/user-prefs";

type DebugBody = {
  /** Internal user id or telegram id. */
  userId?: unknown;
  telegramId?: unknown;
  /** Reset intro + nick prompt dismiss flags. */
  resetModals?: unknown;
  /** Delete all streak freezes for this user. */
  resetFreeze?: unknown;
  /** Clear competitive display name. */
  resetNick?: unknown;
  /** Delete standings for all seasons. */
  resetStandings?: unknown;
  /**
   * Delete all competitive_results for user (resets streak + historical day points).
   * Does not remove votes.
   */
  resetResults?: unknown;
};

/**
 * POST — admin debug reset for a competitive account.
 * Body flags select which slices to wipe.
 */
export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: DebugBody;
  try {
    body = (await request.json()) as DebugBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const flags = {
    resetModals: body.resetModals === true,
    resetFreeze: body.resetFreeze === true,
    resetNick: body.resetNick === true,
    resetStandings: body.resetStandings === true,
    resetResults: body.resetResults === true,
  };

  if (!Object.values(flags).some(Boolean)) {
    return NextResponse.json(
      {
        error:
          "Select at least one: resetModals, resetFreeze, resetNick, resetStandings, resetResults",
      },
      { status: 400 },
    );
  }

  const userIdNum =
    typeof body.userId === "number"
      ? body.userId
      : typeof body.userId === "string" && body.userId.trim()
        ? Number(body.userId)
        : NaN;
  const tgNum =
    typeof body.telegramId === "number"
      ? body.telegramId
      : typeof body.telegramId === "string" && body.telegramId.trim()
        ? Number(body.telegramId)
        : NaN;

  if (!Number.isFinite(userIdNum) && !Number.isFinite(tgNum)) {
    return NextResponse.json(
      { error: "userId or telegramId is required" },
      { status: 400 },
    );
  }

  try {
    const conditions = [];
    if (Number.isFinite(userIdNum)) conditions.push(eq(users.id, userIdNum));
    if (Number.isFinite(tgNum)) conditions.push(eq(users.telegramId, tgNum));

    const [target] = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        competitiveDisplayName: users.competitiveDisplayName,
      })
      .from(users)
      .where(conditions.length === 1 ? conditions[0]! : or(...conditions))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const done: string[] = [];

    if (flags.resetModals) {
      await resetCompetitiveModalPrefs(target.id);
      done.push("modals");
    }

    if (flags.resetFreeze) {
      await db
        .delete(competitiveStreakFreezes)
        .where(eq(competitiveStreakFreezes.userId, target.id));
      done.push("freeze");
    }

    if (flags.resetNick) {
      await db
        .update(users)
        .set({
          competitiveDisplayName: null,
          competitiveDisplayNameUpdatedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, target.id));
      done.push("nick");
    }

    if (flags.resetStandings) {
      await db
        .delete(competitiveStandings)
        .where(eq(competitiveStandings.userId, target.id));
      done.push("standings");
    }

    if (flags.resetResults) {
      await db
        .delete(competitiveResults)
        .where(eq(competitiveResults.userId, target.id));
      done.push("results");
    }

    await writeAuditLog({
      actorUserId: actor.id,
      action: "competitive.debug.reset",
      details: JSON.stringify({
        targetUserId: target.id,
        telegramId: target.telegramId,
        done,
      }),
    });

    console.log(
      `[competitive-debug] reset by=${actor.id} target=${target.id} done=${done.join(",")}`,
    );

    return NextResponse.json({
      ok: true,
      user: {
        id: target.id,
        telegramId: target.telegramId,
        telegramUsername: target.telegramUsername,
      },
      done,
    });
  } catch (error) {
    console.error("[admin/competitive/debug] POST", error);
    return NextResponse.json(
      { error: "Failed to reset account" },
      { status: 500 },
    );
  }
}

/** GET — lookup user debug snapshot by ?userId= or ?telegramId= */
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userIdRaw = url.searchParams.get("userId");
  const tgRaw = url.searchParams.get("telegramId");
  const userIdNum = userIdRaw ? Number(userIdRaw) : NaN;
  const tgNum = tgRaw ? Number(tgRaw) : NaN;

  if (!Number.isFinite(userIdNum) && !Number.isFinite(tgNum)) {
    return NextResponse.json(
      { error: "userId or telegramId query required" },
      { status: 400 },
    );
  }

  try {
    const conditions = [];
    if (Number.isFinite(userIdNum)) conditions.push(eq(users.id, userIdNum));
    if (Number.isFinite(tgNum)) conditions.push(eq(users.telegramId, tgNum));

    const [target] = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        competitiveDisplayName: users.competitiveDisplayName,
        competitiveDisplayNameUpdatedAt: users.competitiveDisplayNameUpdatedAt,
        role: users.role,
      })
      .from(users)
      .where(conditions.length === 1 ? conditions[0]! : or(...conditions))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [prefs] = await db
      .select()
      .from(competitiveUserPrefs)
      .where(eq(competitiveUserPrefs.userId, target.id))
      .limit(1);

    const [freezeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competitiveStreakFreezes)
      .where(eq(competitiveStreakFreezes.userId, target.id));

    const [resultCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competitiveResults)
      .where(eq(competitiveResults.userId, target.id));

    const [standingCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(competitiveStandings)
      .where(eq(competitiveStandings.userId, target.id));

    return NextResponse.json({
      user: target,
      prefs: prefs ?? {
        introDismissed: false,
        nickPromptDismissed: false,
      },
      freezesUsed: freezeCount?.count ?? 0,
      resultsCount: resultCount?.count ?? 0,
      standingsCount: standingCount?.count ?? 0,
    });
  } catch (error) {
    console.error("[admin/competitive/debug] GET", error);
    return NextResponse.json(
      { error: "Failed to load debug snapshot" },
      { status: 500 },
    );
  }
}
