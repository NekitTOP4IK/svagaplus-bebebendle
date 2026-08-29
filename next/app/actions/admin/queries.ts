"use server";

import { requireRole } from "@/lib/auth-server";
import {
  getCompetitiveDailyPreview,
  generateCompetitiveDailyForDate,
} from "@/lib/admin/competitive-daily";
import {
  getCompetitiveDebugSnapshot,
  resetCompetitiveDebug,
} from "@/lib/admin/competitive-debug";
import { getCompetitiveSeasonDetail } from "@/lib/admin/competitive-season-detail";
import { getAdminScran, listAdminScrans } from "@/lib/admin/scrans";
import { writeAuditLog } from "@/lib/moderation-audit";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";

type QueryResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; message: string }>;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function getCompetitiveDebugAction(
  input: Readonly<{ userId?: string; telegramId?: string }>,
): Promise<QueryResult<unknown>> {
  try {
    await requireRole("admin");
    return { success: true, data: await getCompetitiveDebugSnapshot(input) };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка загрузки") };
  }
}

export async function resetCompetitiveDebugAction(
  input: Record<string, unknown>,
): Promise<QueryResult<unknown>> {
  try {
    const actor = await requireRole("admin");
    return {
      success: true,
      data: await resetCompetitiveDebug(actor.id, input),
    };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка сброса") };
  }
}

export async function getCompetitiveDailyPreviewAction(
  date: string,
): Promise<QueryResult<unknown>> {
  try {
    await requireRole("admin");
    return { success: true, data: await getCompetitiveDailyPreview(date) };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка загрузки") };
  }
}

export async function generateCompetitiveDailyAction(
  date: string,
): Promise<QueryResult<unknown>> {
  try {
    const actor = await requireRole("admin");
    const result = await generateCompetitiveDailyForDate(date);
    if (!result.ok) return { success: false, message: result.error };
    await writeAuditLog({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.COMPETITIVE_DAILY_GENERATE,
      details: JSON.stringify({ date, dailyId: result.dailyId }),
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка генерации") };
  }
}

export async function getCompetitiveSeasonDetailAction(
  id: number,
): Promise<QueryResult<unknown>> {
  try {
    await requireRole("admin");
    const data = await getCompetitiveSeasonDetail(id);
    return data
      ? { success: true, data }
      : { success: false, message: "Not found" };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка загрузки") };
  }
}

export async function getAdminScranAction(
  id: number,
): Promise<QueryResult<unknown>> {
  try {
    const actor = await requireRole("moderator");
    const data = await getAdminScran(id);
    return data
      ? { success: true, data: { ...data, viewerRole: actor.role } }
      : { success: false, message: "Scran not found" };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка загрузки") };
  }
}

export async function getAdminScransAction(
  query: string,
): Promise<QueryResult<unknown>> {
  try {
    await requireRole("moderator");
    return { success: true, data: await listAdminScrans(query) };
  } catch (error) {
    return { success: false, message: errorMessage(error, "Ошибка загрузки") };
  }
}
