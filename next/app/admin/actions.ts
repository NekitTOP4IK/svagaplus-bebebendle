"use server";

import { db, dailyScrandles, dailyUserResults, moderationAuditLog, scrans, users } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth-server";
import { getLiveHealth, getReadyHealth, type LiveHealth, type ReadyHealth } from "@/lib/health";

type AdminActionSuccess<T> = { success: true; data: T };
type AdminActionFailure = { success: false; message: string };
export type AdminActionResult<T> = AdminActionSuccess<T> | AdminActionFailure;

export type AdminStats = {
  scrans: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    subscribersPending: number;
    unchecked: number;
  };
  users: { total: number; admins: number; moderators: number };
  plays: { results: number; avgScore: number };
  dailyDays: number;
};

export type AdminAuditLog = {
  id: number;
  action: string;
  scranId: number | null;
  targetTelegramId: string | null;
  details: string | null;
  createdAt: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
};

export type AdminDuplicateGroup = { name: string; count: number; ids: number[] };

export type AdminHealth = {
  ready: { status: number; body: ReadyHealth };
  live: { status: number; body: LiveHealth };
  env: string;
  now: string;
};

function unauthorized<T>(): AdminActionResult<T> {
  return { success: false, message: "Unauthorized" };
}

export async function getAdminStats(): Promise<AdminActionResult<AdminStats>> {
  try {
    await requireRole("moderator");
  } catch {
    return unauthorized();
  }

  try {
    const [scranStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false)::int`,
        approved: sql<number>`count(*) filter (where ${scrans.approved} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${scrans.rejected} = true)::int`,
        subscribersPending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false and ${scrans.isSubscriberAtSubmit} = true)::int`,
        unchecked: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false and ${scrans.isSubscriberAtSubmit} is null)::int`,
      })
      .from(scrans);
    const [userStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
        moderators: sql<number>`count(*) filter (where ${users.role} = 'moderator')::int`,
      })
      .from(users);
    const [playStats] = await db
      .select({
        results: sql<number>`count(*)::int`,
        avgScore: sql<number>`coalesce(round(avg(${dailyUserResults.score})::numeric, 2), 0)::real`,
      })
      .from(dailyUserResults);
    const [dailyDays] = await db
      .select({ days: sql<number>`count(distinct ${dailyScrandles.date})::int` })
      .from(dailyScrandles);

    return {
      success: true,
      data: { scrans: scranStats, users: userStats, plays: playStats, dailyDays: dailyDays?.days ?? 0 },
    };
  } catch (error) {
    console.error("[admin/actions/stats]", error);
    return { success: false, message: "Failed to load stats" };
  }
}

export async function getAdminAuditLogs(limit = 80): Promise<AdminActionResult<AdminAuditLog[]>> {
  try {
    await requireRole("admin");
  } catch {
    return unauthorized();
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return { success: false, message: "Invalid audit limit" };
  }

  try {
    const rows = await db
      .select({
        id: moderationAuditLog.id,
        action: moderationAuditLog.action,
        scranId: moderationAuditLog.scranId,
        targetTelegramId: moderationAuditLog.targetTelegramId,
        details: moderationAuditLog.details,
        createdAt: moderationAuditLog.createdAt,
        actorUsername: users.telegramUsername,
        actorDisplayName: users.displayName,
      })
      .from(moderationAuditLog)
      .leftJoin(users, eq(moderationAuditLog.actorUserId, users.id))
      .orderBy(desc(moderationAuditLog.createdAt))
      .limit(limit);
    return {
      success: true,
      data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  } catch (error) {
    console.error("[admin/actions/audit]", error);
    return { success: false, message: "Failed to load audit" };
  }
}

export async function getAdminDuplicates(): Promise<AdminActionResult<AdminDuplicateGroup[]>> {
  try {
    await requireRole("moderator");
  } catch {
    return unauthorized();
  }

  try {
    const groups = await db.execute(sql`
      select lower(name) as key, count(*)::int as cnt, array_agg(id order by id) as ids
      from scrans where rejected = false group by lower(name)
      having count(*) > 1 order by count(*) desc limit 40
    `);
    return {
      success: true,
      data: (groups.rows as Array<{ key: string; cnt: number; ids: number[] }>).map((group) => ({
        name: group.key,
        count: group.cnt,
        ids: group.ids,
      })),
    };
  } catch (error) {
    console.error("[admin/actions/duplicates]", error);
    return { success: false, message: "Failed to find duplicates" };
  }
}

export async function getAdminHealth(): Promise<AdminActionResult<AdminHealth>> {
  try {
    await requireRole("admin");
  } catch {
    return unauthorized();
  }

  try {
    const [readyBody, liveBody] = await Promise.all([getReadyHealth(), Promise.resolve(getLiveHealth())]);
    return {
      success: true,
      data: {
        ready: { status: readyBody.status === "ok" ? 200 : 503, body: readyBody },
        live: { status: 200, body: liveBody },
        env: process.env.APP_ENV || "unknown",
        now: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[admin/actions/health]", error);
    return { success: false, message: "Health check failed" };
  }
}

// Minimal admin-only users management (admins only)
export interface AdminUser {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  displayName: string | null;
  role: "player" | "moderator" | "admin";
  createdAt: Date | null;
}

export async function getUsers(): Promise<AdminUser[]> {
  try {
    await requireRole("admin");
  } catch {
    return [];
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.id))
      .limit(200);

    return rows.map((r) => ({
      id: r.id,
      telegramId: r.telegramId,
      telegramUsername: r.telegramUsername,
      displayName: r.displayName,
      role: r.role as AdminUser["role"],
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

export async function updateUserRole(
  userId: number,
  newRole: "player" | "moderator" | "admin"
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireRole("admin");
  } catch {
    return { success: false, message: "Unauthorized" };
  }

  if (!userId || userId <= 0) {
    return { success: false, message: "Invalid user id" };
  }

  try {
    await db
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error("Error updating user role:", error);
    return { success: false, message: "Failed to update role" };
  }
}
