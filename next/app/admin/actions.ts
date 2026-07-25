"use server";

import { competitiveResults, db, dailyScrandles, dailyUserResults, moderationAuditLog, scrans, userSessions, users } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
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

export interface AdminUser {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  displayName: string | null;
  role: "player" | "streamer" | "moderator" | "admin";
  isSubscriber: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type AdminUserDiagnostics = AdminUser & {
  telegramPhotoUrl: string | null;
  svagaTelegramUserId: number | null;
  svagaUserId: string | null;
  linkedAt: Date | null;
  lastSyncedAt: Date | null;
  lastSyncAttemptAt: Date | null;
  lastSyncError: string | null;
  sessionCount: number;
  casualResultCount: number;
  competitiveResultCount: number;
  competitiveStreakFreezeSeasonId: number | null;
  competitiveStreakFreezeUsedAt: Date | null;
  competitiveStreakFreezeDate: string | null;
};

export type UserPatch = Partial<Pick<AdminUserDiagnostics, "displayName" | "telegramUsername" | "role" | "isSubscriber" | "lastSyncedAt" | "lastSyncAttemptAt" | "lastSyncError">>;
const USER_ROLES = ["player", "streamer", "moderator", "admin"] as const;
const MAX_USER_PAGE_SIZE = 100;

function validUserId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function userSearchCondition(query: string) {
  if (!query) return undefined;
  const pattern = `%${query}%`;
  return or(ilike(users.displayName, pattern), ilike(users.telegramUsername, pattern), ilike(sql<string>`cast(${users.telegramId} as text)`, pattern));
}

export async function getUsersPage(queryInput = "", pageInput = 1, pageSizeInput = 25): Promise<AdminActionResult<{ rows: AdminUser[]; total: number }>> {
  try {
    await requireRole("admin");
  } catch {
    return unauthorized();
  }
  const query = typeof queryInput === "string" ? queryInput.trim().slice(0, 100) : "";
  const page = Number.isInteger(pageInput) && pageInput > 0 ? pageInput : 1;
  const pageSize = Number.isInteger(pageSizeInput) && pageSizeInput > 0 ? Math.min(pageSizeInput, MAX_USER_PAGE_SIZE) : 25;
  const condition = userSearchCondition(query);
  try {
    const rowsQuery = db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        role: users.role,
        isSubscriber: users.isSubscriber,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users);
    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [rows, counts] = await Promise.all([
      (condition ? rowsQuery.where(condition) : rowsQuery).orderBy(desc(users.id)).limit(pageSize).offset((page - 1) * pageSize),
      condition ? countQuery.where(condition) : countQuery,
    ]);
    return { success: true, data: {
      rows: rows.map((row) => ({ ...row, role: row.role as AdminUser["role"] })),
      total: counts[0]?.count ?? 0,
    } };
  } catch (error) {
    console.error("[admin/actions/users-page]", error);
    return { success: false, message: "Failed to load users" };
  }
}

export async function getUserDiagnostics(userId: number): Promise<AdminActionResult<AdminUserDiagnostics>> {
  try {
    await requireRole("admin");
  } catch {
    return unauthorized();
  }
  if (!validUserId(userId)) return { success: false, message: "Invalid user id" };
  try {
    const [row] = await db.select({ id: users.id, telegramId: users.telegramId, telegramUsername: users.telegramUsername, telegramPhotoUrl: users.telegramPhotoUrl, displayName: users.displayName, role: users.role, svagaTelegramUserId: users.svagaTelegramUserId, svagaUserId: users.svagaUserId, linkedAt: users.linkedAt, isSubscriber: users.isSubscriber, lastSyncedAt: users.lastSyncedAt, lastSyncAttemptAt: users.lastSyncAttemptAt, lastSyncError: users.lastSyncError, competitiveStreakFreezeSeasonId: users.competitiveStreakFreezeSeasonId, competitiveStreakFreezeUsedAt: users.competitiveStreakFreezeUsedAt, competitiveStreakFreezeDate: users.competitiveStreakFreezeDate, createdAt: users.createdAt, updatedAt: users.updatedAt }).from(users).where(eq(users.id, userId)).limit(1);
    if (!row) return { success: false, message: "User not found" };
    const [sessions, casual, competitive] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(userSessions).where(eq(userSessions.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(dailyUserResults).where(eq(dailyUserResults.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(competitiveResults).where(eq(competitiveResults.userId, userId)),
    ]);
    return { success: true, data: { ...row, role: row.role as AdminUser["role"], sessionCount: sessions[0]?.count ?? 0, casualResultCount: casual[0]?.count ?? 0, competitiveResultCount: competitive[0]?.count ?? 0 } };
  } catch (error) {
    console.error("[admin/actions/user-diagnostics]", error);
    return { success: false, message: "Failed to load user diagnostics" };
  }
}

function parseUserPatch(input: UserPatch): { patch?: Record<string, string | boolean | Date | null>; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Invalid patch" };
  const allowed = new Set(["displayName", "telegramUsername", "role", "isSubscriber", "lastSyncedAt", "lastSyncAttemptAt", "lastSyncError"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { error: "Invalid patch field" };
  const patch: Record<string, string | boolean | Date | null> = {};
  if ("role" in input) {
    if (!USER_ROLES.includes(input.role as AdminUser["role"])) return { error: "Invalid role" };
    patch.role = input.role as string;
  }
  for (const key of ["displayName", "lastSyncError"] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (value !== null && (typeof value !== "string" || value.trim().length > (key === "displayName" ? 100 : 1_000))) return { error: `Invalid ${key}` };
      patch[key] = value === null ? null : value.trim() || null;
    }
  }
  if ("telegramUsername" in input) {
    const value = input.telegramUsername;
    if (value !== null && (typeof value !== "string" || !/^[A-Za-z0-9_]{5,32}$/.test(value))) return { error: "Invalid telegramUsername" };
    patch.telegramUsername = value ?? null;
  }
  if ("isSubscriber" in input) {
    if (input.isSubscriber !== null && typeof input.isSubscriber !== "boolean") return { error: "Invalid isSubscriber" };
    patch.isSubscriber = input.isSubscriber ?? null;
  }
  for (const key of ["lastSyncedAt", "lastSyncAttemptAt"] as const) {
    const value = input[key];
    if (value !== undefined) {
      if (value !== null && (!(value instanceof Date) || Number.isNaN(value.getTime()))) return { error: `Invalid ${key}` };
      patch[key] = value ?? null;
    }
  }
  return Object.keys(patch).length ? { patch } : { error: "No changes" };
}

export async function updateUser(userId: number, input: UserPatch): Promise<AdminActionResult<null>> {
  let actor: { id: number };
  try { actor = await requireRole("admin"); } catch { return unauthorized(); }
  if (!validUserId(userId)) return { success: false, message: "Invalid user id" };
  const parsed = parseUserPatch(input);
  const patch = parsed.patch;
  if (!patch) return { success: false, message: parsed.error ?? "Invalid patch" };
  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx.select({ id: users.id, displayName: users.displayName, telegramUsername: users.telegramUsername, role: users.role, isSubscriber: users.isSubscriber, lastSyncedAt: users.lastSyncedAt, lastSyncAttemptAt: users.lastSyncAttemptAt, lastSyncError: users.lastSyncError }).from(users).where(eq(users.id, userId)).limit(1);
      if (!target) return { success: false, message: "User not found" };
      if ("role" in patch) {
        if (target.role === "admin" && patch.role !== "admin") {
          // Lock every current admin before counting. A concurrent demotion waits,
          // then sees the post-commit count and cannot remove the final admin.
          await tx.execute(sql`select ${users.id} from ${users} where ${users.role} = 'admin' for update`);
          const [admins] = await tx.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "admin"));
          if ((admins?.count ?? 0) <= 1) return { success: false, message: "Cannot demote the final admin" };
        }
      }
      const updated = await tx.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
      if (updated.length === 0) return { success: false, message: "User not found" };
      const changes = Object.fromEntries(
        Object.entries(patch).map(([field, next]) => [field, { old: target[field as keyof typeof target] ?? null, new: next }]),
      );
      await tx.insert(moderationAuditLog).values({
        actorUserId: actor.id,
        action: "users.update",
        details: JSON.stringify({ userId, changed: Object.keys(patch), changes }),
      });
      return { success: true, data: null };
    });
  } catch (error) {
    console.error("[admin/actions/update-user]", error);
    return { success: false, message: "Failed to update user" };
  }
}
