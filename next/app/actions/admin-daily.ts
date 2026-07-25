"use server";

import { desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import type { ActionResult } from "@/lib/action-result";
import { db, dailyScrandles } from "@/db/schema";
import { generateDailyForDate, getDailyPreview, todayUtcDate } from "@/lib/daily-generate";
import { writeAuditLog } from "@/lib/moderation-audit";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import {
  getDailyDisabledReason,
  isDailyGenerationEnabled,
  isDailyRotationNotifyEnabled,
  setDailyDisabledReason,
  setDailyGenerationEnabled,
  setDailyRotationNotifyEnabled,
} from "@/lib/app-settings";

type StaffError = "unauthorized" | "forbidden" | "invalid_input" | "rate_limited" | "internal";
type Settings = Readonly<{
  dailyRotationNotify: boolean;
  dailyGenerationEnabled: boolean;
  dailyDisabledReason: string;
}>;

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function requireStaffAction(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; result: ActionResult<never, StaffError> }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, result: { ok: false, code: "unauthorized", message: "Authentication is required." } };
  if (user.role !== "moderator" && user.role !== "admin") {
    return { ok: false, result: { ok: false, code: "forbidden", message: "Staff access is required." } };
  }
  return { ok: true, user };
}

async function getSettings(): Promise<Settings> {
  const [dailyRotationNotify, dailyGenerationEnabled, dailyDisabledReason] = await Promise.all([
    isDailyRotationNotifyEnabled(), isDailyGenerationEnabled(), getDailyDisabledReason(),
  ]);
  return { dailyRotationNotify, dailyGenerationEnabled, dailyDisabledReason };
}

async function allowAdminMutation(userId: number, action: string): Promise<boolean> {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip") ?? "unknown";
  const result = await checkRateLimit(`admin-action:${action}:${userId}:${ip}`, 30, 60, "closed");
  return result.allowed;
}

export async function getAdminDailyView(input: { date?: string } = {}): Promise<ActionResult<unknown, StaffError>> {
  const auth = await requireStaffAction();
  if (!auth.ok) return auth.result;
  const date = input.date || todayUtcDate();
  if (!isDate(date)) return { ok: false, code: "invalid_input", message: "Invalid date." };
  try {
    const [preview, recent] = await Promise.all([
      getDailyPreview(date),
      db.select({ date: dailyScrandles.date, rounds: sql<number>`count(*)::int` })
        .from(dailyScrandles).groupBy(dailyScrandles.date).orderBy(desc(dailyScrandles.date)).limit(60),
    ]);
    return { ok: true, data: { ...preview, calendar: recent } };
  } catch (error) {
    console.error("[actions/admin-daily] preview failed", error);
    return { ok: false, code: "internal", message: "Failed to load daily status." };
  }
}

export async function getAdminDailySettings(): Promise<ActionResult<Settings, StaffError>> {
  const auth = await requireStaffAction();
  if (!auth.ok) return auth.result;
  try { return { ok: true, data: await getSettings() }; }
  catch (error) { console.error("[actions/admin-daily] settings failed", error); return { ok: false, code: "internal", message: "Failed to load settings." }; }
}

export async function generateAdminDaily(input: { date?: string }): Promise<ActionResult<{ date: string; notify: unknown }, StaffError>> {
  const auth = await requireStaffAction();
  if (!auth.ok) return auth.result;
  if (auth.user.role !== "admin") return { ok: false, code: "forbidden", message: "Administrator access is required." };
  if (!await allowAdminMutation(auth.user.id, "daily-generate")) return { ok: false, code: "rate_limited", message: "Too many requests." };
  const date = input.date || todayUtcDate();
  if (!isDate(date)) return { ok: false, code: "invalid_input", message: "Invalid date." };
  try {
    const result = await generateDailyForDate(date);
    if (!result.ok) return { ok: false, code: "internal", message: result.error };
    await writeAuditLog({ actorUserId: auth.user.id, action: AUDIT_ACTIONS.DAILY_GENERATE, details: JSON.stringify({ date, rounds: result.rounds.length }) });
    return { ok: true, data: { date: result.date, notify: result.notify ?? null } };
  } catch (error) {
    console.error("[actions/admin-daily] generation failed", error);
    return { ok: false, code: "internal", message: "Failed to generate daily." };
  }
}

export async function updateAdminDailySettings(input: Partial<Settings>): Promise<ActionResult<Settings, StaffError>> {
  const auth = await requireStaffAction();
  if (!auth.ok) return auth.result;
  if (auth.user.role !== "admin") return { ok: false, code: "forbidden", message: "Administrator access is required." };
  if (!await allowAdminMutation(auth.user.id, "daily-settings")) return { ok: false, code: "rate_limited", message: "Too many requests." };
  if (typeof input.dailyDisabledReason === "string" && input.dailyDisabledReason.length > 500) {
    return { ok: false, code: "invalid_input", message: "Disabled reason is too long." };
  }
  const touched = typeof input.dailyRotationNotify === "boolean" || typeof input.dailyGenerationEnabled === "boolean" || typeof input.dailyDisabledReason === "string";
  if (!touched) return { ok: false, code: "invalid_input", message: "No valid fields." };
  try {
    if (typeof input.dailyRotationNotify === "boolean") {
      await setDailyRotationNotifyEnabled(input.dailyRotationNotify);
      await writeAuditLog({ actorUserId: auth.user.id, action: AUDIT_ACTIONS.SETTINGS_DAILY_ROTATION_NOTIFY, details: JSON.stringify({ enabled: input.dailyRotationNotify }) });
    }
    if (typeof input.dailyGenerationEnabled === "boolean") {
      await setDailyGenerationEnabled(input.dailyGenerationEnabled);
      await writeAuditLog({ actorUserId: auth.user.id, action: AUDIT_ACTIONS.SETTINGS_DAILY_GENERATION, details: JSON.stringify({ enabled: input.dailyGenerationEnabled, reason: input.dailyDisabledReason }) });
    }
    if (typeof input.dailyDisabledReason === "string") await setDailyDisabledReason(input.dailyDisabledReason);
    return { ok: true, data: await getSettings() };
  } catch (error) {
    console.error("[actions/admin-daily] settings update failed", error);
    return { ok: false, code: "internal", message: "Failed to save settings." };
  }
}
