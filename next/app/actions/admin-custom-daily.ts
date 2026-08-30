"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import type { ActionResult } from "@/lib/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import {
  cancelCustomDailyEvent,
  createCustomDailyEvent,
  getCustomDailyEvent,
  listCustomDailyEvents,
  publishCustomDailyEvent,
  searchApprovedCustomDailyScrans as searchApprovedScrans,
  updateCustomDailyEvent,
  validateCustomDailyInput,
  type CustomDailyDetail,
  type CustomDailyDomainResult,
  type CustomDailyErrorCode,
  type CustomDailyScran,
  type CustomDailySummary,
} from "@/lib/admin/custom-daily";
import { getCurrentUser } from "@/lib/auth-server";
import { notifyAuthorsDailyRotation } from "@/lib/daily-rotation-notify";
import { writeAuditLog } from "@/lib/moderation-audit";

export type {
  CustomDailyDetail,
  CustomDailyEntry,
  CustomDailyInput,
  CustomDailyStatus,
  CustomDailySummary,
} from "@/lib/admin/custom-daily";

type CustomDailyActionError =
  | CustomDailyErrorCode
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "internal";

type AuthResult =
  | Readonly<{ ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }>
  | Readonly<{ ok: false; result: ActionResult<never, CustomDailyActionError> }>;

async function requireStaff(adminOnly = false): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, result: { ok: false, code: "unauthorized", message: "Требуется авторизация." } };
  }
  if (adminOnly && user.role !== "admin") {
    return { ok: false, result: { ok: false, code: "forbidden", message: "Требуются права администратора." } };
  }
  if (!adminOnly && user.role !== "admin" && user.role !== "moderator") {
    return { ok: false, result: { ok: false, code: "forbidden", message: "Требуется доступ сотрудника." } };
  }
  return { ok: true, user };
}

async function allowMutation(userId: number, operation: string): Promise<boolean> {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? requestHeaders.get("x-real-ip")
    ?? "unknown";
  return (await checkRateLimit(
    `admin-action:custom-daily:${operation}:${userId}:${ip}`,
    30,
    60,
    "closed",
  )).allowed;
}

function validId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toActionFailure<T>(result: Extract<CustomDailyDomainResult<T>, { ok: false }>): ActionResult<never, CustomDailyActionError> {
  return result;
}

function auditDetails(event: CustomDailyDetail, bulkAssisted = false): string {
  return JSON.stringify({
    eventId: event.id,
    name: event.name,
    date: event.targetDate,
    status: event.status,
    selectedIds: event.entries.map((entry) => entry.id),
    notifyAuthors: event.notifyAuthors,
    bulkAssisted,
  });
}

async function writeCustomDailyAudit(
  input: Parameters<typeof writeAuditLog>[0],
): Promise<void> {
  try {
    await writeAuditLog(input);
  } catch (error) {
    // The domain mutation has already committed. Do not tell the administrator
    // it failed and invite a duplicate retry merely because audit storage failed.
    console.error("[actions/admin-custom-daily] audit failed", error);
  }
}

export async function listAdminCustomDailyEvents(): Promise<ActionResult<CustomDailySummary[], CustomDailyActionError>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth.result;
  try {
    return { ok: true, data: await listCustomDailyEvents() };
  } catch (error) {
    console.error("[actions/admin-custom-daily] list failed", error);
    return { ok: false, code: "internal", message: "Не удалось загрузить события." };
  }
}

export async function getAdminCustomDailyEvent(idInput: unknown): Promise<ActionResult<CustomDailyDetail, CustomDailyActionError>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth.result;
  const id = validId(idInput);
  if (!id) return { ok: false, code: "invalid_input", message: "Некорректный ID события." };
  try {
    const event = await getCustomDailyEvent(id);
    return event
      ? { ok: true, data: event }
      : { ok: false, code: "not_found", message: "Событие не найдено." };
  } catch (error) {
    console.error("[actions/admin-custom-daily] get failed", error);
    return { ok: false, code: "internal", message: "Не удалось загрузить событие." };
  }
}

type CustomDailyActionInput = Readonly<{
  name: unknown;
  targetDate: unknown;
  notifyAuthors: unknown;
  scranIds: unknown;
  bulkAssisted?: unknown;
}>;

export async function createAdminCustomDailyEvent(
  input: CustomDailyActionInput,
): Promise<ActionResult<CustomDailyDetail, CustomDailyActionError>> {
  const auth = await requireStaff(true);
  if (!auth.ok) return auth.result;
  if (!await allowMutation(auth.user.id, "create")) {
    return { ok: false, code: "rate_limited", message: "Слишком много запросов." };
  }
  const validated = validateCustomDailyInput(input);
  if (!validated.ok) return toActionFailure(validated);
  try {
    const result = await createCustomDailyEvent(validated.data, auth.user.id);
    if (!result.ok) return toActionFailure(result);
    await writeCustomDailyAudit({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.DAILY_CUSTOM_CREATE,
      details: auditDetails(result.data, input.bulkAssisted === true),
    });
    return result;
  } catch (error) {
    console.error("[actions/admin-custom-daily] create failed", error);
    return { ok: false, code: "internal", message: "Не удалось создать событие." };
  }
}

export async function updateAdminCustomDailyEvent(
  input: CustomDailyActionInput & Readonly<{ id: unknown }>,
): Promise<ActionResult<CustomDailyDetail, CustomDailyActionError>> {
  const auth = await requireStaff(true);
  if (!auth.ok) return auth.result;
  const id = validId(input.id);
  if (!id) return { ok: false, code: "invalid_input", message: "Некорректный ID события." };
  if (!await allowMutation(auth.user.id, "update")) {
    return { ok: false, code: "rate_limited", message: "Слишком много запросов." };
  }
  const validated = validateCustomDailyInput(input);
  if (!validated.ok) return toActionFailure(validated);
  try {
    const result = await updateCustomDailyEvent(id, validated.data);
    if (!result.ok) return toActionFailure(result);
    await writeCustomDailyAudit({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.DAILY_CUSTOM_UPDATE,
      details: auditDetails(result.data, input.bulkAssisted === true),
    });
    return result;
  } catch (error) {
    console.error("[actions/admin-custom-daily] update failed", error);
    return { ok: false, code: "internal", message: "Не удалось сохранить событие." };
  }
}

export async function searchApprovedCustomDailyScrans(
  queryInput: unknown,
): Promise<ActionResult<CustomDailyScran[], CustomDailyActionError>> {
  const auth = await requireStaff();
  if (!auth.ok) return auth.result;
  if (typeof queryInput !== "string") {
    return { ok: false, code: "invalid_input", message: "Некорректный поисковый запрос." };
  }
  try {
    return { ok: true, data: await searchApprovedScrans(queryInput) };
  } catch (error) {
    console.error("[actions/admin-custom-daily] scran search failed", error);
    return { ok: false, code: "internal", message: "Не удалось найти блюда." };
  }
}

export async function publishAdminCustomDailyEvent(
  idInput: unknown,
): Promise<ActionResult<Readonly<{
  event: CustomDailyDetail;
  notify: Readonly<{ sent: number; skipped: number; disabled: boolean }> | null;
}>, CustomDailyActionError>> {
  const auth = await requireStaff(true);
  if (!auth.ok) return auth.result;
  const id = validId(idInput);
  if (!id) return { ok: false, code: "invalid_input", message: "Некорректный ID события." };
  if (!await allowMutation(auth.user.id, "publish")) {
    return { ok: false, code: "rate_limited", message: "Слишком много запросов." };
  }
  try {
    const result = await publishCustomDailyEvent(id);
    if (!result.ok) return toActionFailure(result);
    await writeCustomDailyAudit({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.DAILY_CUSTOM_PUBLISH,
      details: auditDetails(result.data.event),
    });

    let notify: Readonly<{ sent: number; skipped: number; disabled: boolean }> | null = null;
    if (result.data.event.notifyAuthors) {
      try {
        notify = await notifyAuthorsDailyRotation(
          result.data.event.targetDate,
          [...result.data.notificationScrans],
        );
      } catch (error) {
        console.error("[actions/admin-custom-daily] notification failed", error);
      }
    }
    return { ok: true, data: { event: result.data.event, notify } };
  } catch (error) {
    console.error("[actions/admin-custom-daily] publish failed", error);
    return { ok: false, code: "internal", message: "Не удалось опубликовать событие." };
  }
}

export async function cancelAdminCustomDailyEvent(
  idInput: unknown,
): Promise<ActionResult<CustomDailyDetail, CustomDailyActionError>> {
  const auth = await requireStaff(true);
  if (!auth.ok) return auth.result;
  const id = validId(idInput);
  if (!id) return { ok: false, code: "invalid_input", message: "Некорректный ID события." };
  if (!await allowMutation(auth.user.id, "cancel")) {
    return { ok: false, code: "rate_limited", message: "Слишком много запросов." };
  }
  try {
    const result = await cancelCustomDailyEvent(id);
    if (!result.ok) return toActionFailure(result);
    await writeCustomDailyAudit({
      actorUserId: auth.user.id,
      action: AUDIT_ACTIONS.DAILY_CUSTOM_CANCEL,
      details: auditDetails(result.data),
    });
    return result;
  } catch (error) {
    console.error("[actions/admin-custom-daily] cancel failed", error);
    return { ok: false, code: "internal", message: "Не удалось отменить событие." };
  }
}
