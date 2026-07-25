import { eq, or, sql } from "drizzle-orm";
import {
  competitiveResults,
  competitiveStandings,
  competitiveStreakFreezes,
  competitiveUserPrefs,
  db,
  users,
} from "@/db/schema";
import { resetCompetitiveModalPrefs } from "@/lib/competitive/user-prefs";
import { writeAuditLog } from "@/lib/moderation-audit";

export type CompetitiveDebugInput = Readonly<{
  userId?: number | string;
  telegramId?: number | string;
  resetModals?: boolean;
  resetFreeze?: boolean;
  resetNick?: boolean;
  resetStandings?: boolean;
  resetResults?: boolean;
}>;

function parseId(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function targetCondition(input: CompetitiveDebugInput) {
  const userId = parseId(input.userId);
  const telegramId = parseId(input.telegramId);
  if (userId === null && telegramId === null) return null;
  if (userId !== null && telegramId !== null) {
    return or(eq(users.id, userId), eq(users.telegramId, telegramId));
  }
  return userId !== null ? eq(users.id, userId) : eq(users.telegramId, telegramId!);
}

export async function getCompetitiveDebugSnapshot(input: CompetitiveDebugInput) {
  const condition = targetCondition(input);
  if (!condition) throw new Error("userId or telegramId is required");
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
    .where(condition)
    .limit(1);
  if (!target) throw new Error("User not found");

  const [prefs, freezeRows, resultRows, standingRows] = await Promise.all([
    db.select().from(competitiveUserPrefs).where(eq(competitiveUserPrefs.userId, target.id)).limit(1),
    db.select({ count: sql<number>`count(*)::int` }).from(competitiveStreakFreezes).where(eq(competitiveStreakFreezes.userId, target.id)),
    db.select({ count: sql<number>`count(*)::int` }).from(competitiveResults).where(eq(competitiveResults.userId, target.id)),
    db.select({ count: sql<number>`count(*)::int` }).from(competitiveStandings).where(eq(competitiveStandings.userId, target.id)),
  ]);
  return {
    user: target,
    prefs: prefs[0] ?? { introDismissed: false, nickPromptDismissed: false },
    freezesUsed: freezeRows[0]?.count ?? 0,
    resultsCount: resultRows[0]?.count ?? 0,
    standingsCount: standingRows[0]?.count ?? 0,
  };
}

export async function resetCompetitiveDebug(
  actorUserId: number,
  input: CompetitiveDebugInput,
) {
  const condition = targetCondition(input);
  if (!condition) throw new Error("userId or telegramId is required");
  const flags = {
    resetModals: input.resetModals === true,
    resetFreeze: input.resetFreeze === true,
    resetNick: input.resetNick === true,
    resetStandings: input.resetStandings === true,
    resetResults: input.resetResults === true,
  };
  const done = Object.entries(flags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name.replace(/^reset/, "").toLowerCase());
  if (done.length === 0) throw new Error("Select at least one reset option");

  const [target] = await db
    .select({ id: users.id, telegramId: users.telegramId, telegramUsername: users.telegramUsername })
    .from(users)
    .where(condition)
    .limit(1);
  if (!target) throw new Error("User not found");
  if (flags.resetModals) await resetCompetitiveModalPrefs(target.id);
  if (flags.resetFreeze) await db.delete(competitiveStreakFreezes).where(eq(competitiveStreakFreezes.userId, target.id));
  if (flags.resetNick) await db.update(users).set({ competitiveDisplayName: null, competitiveDisplayNameUpdatedAt: null, updatedAt: new Date() }).where(eq(users.id, target.id));
  if (flags.resetStandings) await db.delete(competitiveStandings).where(eq(competitiveStandings.userId, target.id));
  if (flags.resetResults) await db.delete(competitiveResults).where(eq(competitiveResults.userId, target.id));
  await writeAuditLog({ actorUserId, action: "competitive.debug.reset", details: JSON.stringify({ targetUserId: target.id, telegramId: target.telegramId, done }) });
  return { ok: true as const, user: target, done };
}
