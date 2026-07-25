"use server";

import { desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  dailyScrandles,
  db,
  scrandleVotes,
  scrans,
  telegramVotes,
  users,
} from "@/db/schema";
import { isStaffRole, requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  buildRejectMessage,
  isRejectReasonCode,
  type RejectReasonCode,
} from "@/lib/reject-reasons";
import { ActionResult } from "@/lib/action-result";
import {
  isBanReasonCode,
  resolveBanReason,
  type BanReasonCode,
} from "@/lib/ban-reasons";
import { banTelegramUser } from "@/lib/user-ban";
import {
  recheckScranSubscriber,
  recheckUncheckedScrans,
} from "@/lib/recheck-scran-subscriber";
import { getActiveBan } from "@/lib/user-ban";

type Code = "unauthorized" | "invalid" | "not_found" | "failed";
const validId = (id: unknown): id is number =>
  Number.isInteger(id) && Number(id) > 0;
async function moderator(): Promise<
  ActionResult<{ id: number }, "unauthorized">
> {
  try {
    const user = await requireRole("moderator");
    return { ok: true, data: { id: user.id } };
  } catch {
    return { ok: false, code: "unauthorized", message: "Недостаточно прав" };
  }
}
async function admin(): Promise<ActionResult<{ id: number }, "unauthorized">> {
  try {
    const user = await requireRole("admin");
    return { ok: true, data: { id: user.id } };
  } catch {
    return {
      ok: false,
      code: "unauthorized",
      message: "Только администратор может выполнить это действие",
    };
  }
}
async function notify(telegramId: string | null, text: string): Promise<void> {
  const token = process.env.BOT_TOKEN;
  if (!token || !telegramId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("[moderation-action] notification failed", error);
  }
}

export async function getAdminAuthorAction(
  telegramIdInput: unknown,
): Promise<ActionResult<Record<string, unknown>, Code>> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  const telegramId =
    typeof telegramIdInput === "string" ? telegramIdInput.trim() : "";
  if (!/^\d{3,20}$/.test(telegramId)) {
    return { ok: false, code: "invalid", message: "Некорректный Telegram ID" };
  }
  try {
    const tgNum = Number(telegramId);
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, tgNum))
      .limit(1);
    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false)::int`,
        approved: sql<number>`count(*) filter (where ${scrans.approved} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${scrans.rejected} = true)::int`,
      })
      .from(scrans)
      .where(eq(scrans.telegramId, telegramId));
    const recent = await db
      .select({
        id: scrans.id,
        name: scrans.name,
        price: scrans.price,
        approved: scrans.approved,
        rejected: scrans.rejected,
        rejectReason: scrans.rejectReason,
        isSubscriberAtSubmit: scrans.isSubscriberAtSubmit,
        imageUrl: scrans.imageUrl,
      })
      .from(scrans)
      .where(eq(scrans.telegramId, telegramId))
      .orderBy(desc(scrans.id))
      .limit(20);
    const ban = await getActiveBan(telegramId);
    const stat = stats[0] ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
    const user = userRows[0];
    return {
      ok: true,
      data: {
        telegramId,
        user: user
          ? {
              id: user.id,
              username: user.telegramUsername,
              displayName: user.displayName,
              photoUrl: user.telegramPhotoUrl,
              role: user.role,
              isSubscriber: user.isSubscriber,
            }
          : null,
        ban: ban
          ? {
              reason: ban.reason,
              reasonCode: ban.reasonCode,
              bannedAt: ban.bannedAt,
            }
          : null,
        banned: ban != null,
        stats: stat,
        overPendingLimit: stat.pending > 6,
        recent,
      },
    };
  } catch (error) {
    console.error("[moderation-action] author load failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Не удалось загрузить автора",
    };
  }
}

export async function approveScranAction(
  id: unknown,
): Promise<ActionResult<null, Code>> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  if (!validId(id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  try {
    const [row] = await db
      .update(scrans)
      .set({ approved: true, rejected: false })
      .where(eq(scrans.id, id))
      .returning({ telegramId: scrans.telegramId, name: scrans.name });
    if (!row)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await notify(row.telegramId, `✅ ${row.name} — одобрено и опубликовано!`);
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.approve",
      scranId: id,
      targetTelegramId: row.telegramId,
      details: row.name,
    });
    return { ok: true, data: null };
  } catch (error) {
    console.error("[moderation-action] approve failed", error);
    return { ok: false, code: "failed", message: "Не удалось одобрить блюдо" };
  }
}

export async function rejectScranAction(
  input: Readonly<{ id: unknown; reason?: unknown; note?: unknown }>,
): Promise<ActionResult<{ reason: RejectReasonCode }, Code>> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  if (!validId(input.id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  const reason: RejectReasonCode =
    typeof input.reason === "string" && isRejectReasonCode(input.reason)
      ? input.reason
      : "other";
  const note =
    typeof input.note === "string" ? input.note.trim().slice(0, 280) : "";
  try {
    const [row] = await db
      .select({ telegramId: scrans.telegramId, name: scrans.name })
      .from(scrans)
      .where(eq(scrans.id, input.id))
      .limit(1);
    if (!row)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await db
      .update(scrans)
      .set({
        approved: false,
        rejected: true,
        rejectReason: note ? `${reason}: ${note}` : reason,
        rejectedAt: new Date(),
        rejectedByUserId: actor.data.id,
      })
      .where(eq(scrans.id, input.id));
    await notify(
      row.telegramId,
      buildRejectMessage(row.name, reason, note || undefined),
    );
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.reject",
      scranId: input.id,
      targetTelegramId: row.telegramId,
      details: JSON.stringify({ reason, note: note || null }),
    });
    return { ok: true, data: { reason } };
  } catch (error) {
    console.error("[moderation-action] reject failed", error);
    return { ok: false, code: "failed", message: "Не удалось отклонить блюдо" };
  }
}

export async function unpublishScranAction(
  id: unknown,
): Promise<ActionResult<null, Code>> {
  const actor = await admin();
  if (!actor.ok) return actor;
  if (!validId(id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  try {
    const [row] = await db
      .update(scrans)
      .set({ approved: false })
      .where(eq(scrans.id, id))
      .returning({ telegramId: scrans.telegramId, name: scrans.name });
    if (!row)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.unpublish",
      scranId: id,
      targetTelegramId: row.telegramId,
      details: row.name,
    });
    return { ok: true, data: null };
  } catch (error) {
    console.error("[moderation-action] unpublish failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Не удалось снять публикацию",
    };
  }
}

export async function banUserAction(
  input: Readonly<{
    telegramId: unknown;
    reasonCode: unknown;
    customNote?: unknown;
  }>,
): Promise<
  ActionResult<{ alreadyBanned: boolean; rejectedPending: number }, Code>
> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  const telegramId =
    typeof input.telegramId === "string" ? input.telegramId.trim() : "";
  if (!/^\d{3,20}$/.test(telegramId))
    return { ok: false, code: "invalid", message: "Некорректный Telegram ID" };
  const [actorUser] = await db
    .select({
      telegramId: users.telegramId,
      displayName: users.displayName,
      telegramUsername: users.telegramUsername,
    })
    .from(users)
    .where(eq(users.id, actor.data.id))
    .limit(1);
  if (String(actorUser?.telegramId) === telegramId)
    return { ok: false, code: "invalid", message: "Нельзя забанить себя" };
  const target = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.telegramId, Number(telegramId)))
    .limit(1);
  if (target[0] && isStaffRole(target[0].role))
    return {
      ok: false,
      code: "invalid",
      message: "Нельзя банить модераторов и админов",
    };
  const reasonCode: BanReasonCode =
    typeof input.reasonCode === "string" && isBanReasonCode(input.reasonCode)
      ? input.reasonCode
      : "custom";
  const resolved = resolveBanReason(
    reasonCode,
    typeof input.customNote === "string" ? input.customNote : "",
  );
  if (!resolved.ok)
    return { ok: false, code: "invalid", message: resolved.error };
  try {
    const result = await banTelegramUser({
      telegramId,
      reason: resolved.reason,
      reasonCode,
      actor: {
        id: actor.data.id,
        displayName: actorUser?.displayName ?? null,
        telegramUsername: actorUser?.telegramUsername ?? null,
      },
    });
    return { ok: true, data: result };
  } catch (error) {
    console.error("[moderation-action] ban user failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Не удалось забанить пользователя",
    };
  }
}

export async function restoreScranAction(
  id: unknown,
): Promise<ActionResult<null, Code>> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  if (!validId(id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  try {
    const [existing] = await db
      .select({ telegramId: scrans.telegramId })
      .from(scrans)
      .where(eq(scrans.id, id))
      .limit(1);
    if (!existing)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await db
      .update(scrans)
      .set({
        rejected: false,
        rejectReason: null,
        rejectedAt: null,
        rejectedByUserId: null,
        approved: false,
      })
      .where(eq(scrans.id, id));
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.restore",
      scranId: id,
      targetTelegramId: existing.telegramId,
    });
    return { ok: true, data: null };
  } catch (error) {
    console.error("[moderation-action] restore failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Не удалось восстановить блюдо",
    };
  }
}

export async function editScranAction(
  input: Readonly<{
    id: unknown;
    name?: unknown;
    description?: unknown;
    price?: unknown;
  }>,
): Promise<ActionResult<null, Code>> {
  const actor = await admin();
  if (!actor.ok) return actor;
  if (!validId(input.id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  const patch: Partial<typeof scrans.$inferInsert> = {};
  if (typeof input.name === "string" && input.name.trim())
    patch.name = input.name.trim().slice(0, 200);
  if (input.description !== undefined)
    patch.description =
      input.description === null
        ? null
        : String(input.description).trim().slice(0, 1000);
  if (
    typeof input.price === "number" &&
    Number.isFinite(input.price) &&
    input.price >= 0
  )
    patch.price = input.price;
  if (Object.keys(patch).length === 0)
    return { ok: false, code: "invalid", message: "Нет полей для обновления" };
  try {
    const [existing] = await db
      .select({ telegramId: scrans.telegramId })
      .from(scrans)
      .where(eq(scrans.id, input.id))
      .limit(1);
    if (!existing)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await db.update(scrans).set(patch).where(eq(scrans.id, input.id));
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.edit",
      scranId: input.id,
      targetTelegramId: existing.telegramId,
      details: JSON.stringify(patch),
    });
    return { ok: true, data: null };
  } catch (error) {
    console.error("[moderation-action] edit failed", error);
    return { ok: false, code: "failed", message: "Не удалось сохранить блюдо" };
  }
}

export async function deleteScranAction(
  input: Readonly<{ id: unknown; comment?: unknown }>,
): Promise<ActionResult<null, Code>> {
  const actor = await admin();
  if (!actor.ok) return actor;
  if (!validId(input.id))
    return { ok: false, code: "invalid", message: "Некорректный ID" };
  const scranId = input.id;
  const comment =
    typeof input.comment === "string"
      ? input.comment.trim().slice(0, 1000)
      : "";
  if (!comment)
    return { ok: false, code: "invalid", message: "Комментарий обязателен" };
  try {
    const [row] = await db
      .select({ telegramId: scrans.telegramId, name: scrans.name })
      .from(scrans)
      .where(eq(scrans.id, scranId))
      .limit(1);
    if (!row)
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    await db.transaction(async (tx) => {
      await tx.delete(telegramVotes).where(eq(telegramVotes.scranId, scranId));
      await tx
        .delete(scrandleVotes)
        .where(eq(scrandleVotes.chosenScranId, scranId));
      await tx
        .delete(dailyScrandles)
        .where(
          or(
            eq(dailyScrandles.scranAId, scranId),
            eq(dailyScrandles.scranBId, scranId),
          ),
        );
      await tx.delete(scrans).where(eq(scrans.id, scranId));
    });
    await notify(
      row.telegramId,
      `❌ УВЫ, ваше блюдо «${row.name}» ЗАБАНЕНО по причине: ${comment}`,
    );
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: "scran.delete",
      scranId,
      targetTelegramId: row.telegramId,
      details: JSON.stringify({ name: row.name, comment }),
    });
    return { ok: true, data: null };
  } catch (error) {
    console.error("[moderation-action] delete failed", error);
    return { ok: false, code: "failed", message: "Не удалось удалить блюдо" };
  }
}

export async function bulkModerationAction(
  input: Readonly<{
    action: unknown;
    ids: unknown;
    reason?: unknown;
    note?: unknown;
  }>,
): Promise<ActionResult<{ ok: number; total: number }, Code>> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  if (input.action !== "approve" && input.action !== "reject")
    return {
      ok: false,
      code: "invalid",
      message: "Неизвестное массовое действие",
    };
  if (!Array.isArray(input.ids))
    return { ok: false, code: "invalid", message: "Нужен список ID" };
  const ids = input.ids
    .map((value) =>
      typeof value === "number" ? value : Number.parseInt(String(value), 10),
    )
    .filter(validId)
    .slice(0, 50);
  if (!ids.length)
    return { ok: false, code: "invalid", message: "Нет корректных ID" };
  try {
    const rows = await db
      .select({
        id: scrans.id,
        name: scrans.name,
        telegramId: scrans.telegramId,
      })
      .from(scrans)
      .where(inArray(scrans.id, ids));
    let ok = 0;
    const reason =
      typeof input.reason === "string" && isRejectReasonCode(input.reason)
        ? input.reason
        : "other";
    const note =
      typeof input.note === "string" ? input.note.trim().slice(0, 280) : "";
    for (const row of rows) {
      if (input.action === "approve") {
        await db
          .update(scrans)
          .set({ approved: true, rejected: false })
          .where(eq(scrans.id, row.id));
        await notify(
          row.telegramId,
          `✅ Блюдо «${row.name}» одобрено и появится в игре!`,
        );
      } else {
        await db
          .update(scrans)
          .set({
            approved: false,
            rejected: true,
            rejectReason: note ? `${reason}: ${note}` : reason,
            rejectedAt: new Date(),
            rejectedByUserId: actor.data.id,
          })
          .where(eq(scrans.id, row.id));
        await notify(
          row.telegramId,
          buildRejectMessage(row.name, reason, note || undefined),
        );
      }
      ok += 1;
    }
    await writeAuditLog({
      actorUserId: actor.data.id,
      action: `scran.bulk_${input.action}`,
      details: JSON.stringify({
        ids: rows.map((row) => row.id),
        count: ok,
        reason,
      }),
    });
    return { ok: true, data: { ok, total: rows.length } };
  } catch (error) {
    console.error("[moderation-action] bulk failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Массовое действие не выполнено",
    };
  }
}

export async function recheckScranSubscriberAction(
  input: Readonly<{ scranId?: unknown; allUnchecked?: unknown }>,
): Promise<
  ActionResult<
    | {
        mode: "single";
        result: Awaited<ReturnType<typeof recheckScranSubscriber>>;
      }
    | { mode: "bulk"; total: number; ok: number; failed: number },
    Code
  >
> {
  const actor = await moderator();
  if (!actor.ok) return actor;
  try {
    if (input.allUnchecked === true) {
      const { total, results } = await recheckUncheckedScrans(50);
      const ok = results.filter((result) => result.ok).length;
      return {
        ok: true,
        data: { mode: "bulk", total, ok, failed: results.length - ok },
      };
    }
    if (!validId(input.scranId))
      return {
        ok: false,
        code: "invalid",
        message: "Нужен scranId или allUnchecked",
      };
    const result = await recheckScranSubscriber(input.scranId);
    if (!result.ok && result.reason === "not_found")
      return { ok: false, code: "not_found", message: "Блюдо не найдено" };
    return { ok: true, data: { mode: "single", result } };
  } catch (error) {
    console.error("[moderation-action] recheck failed", error);
    return { ok: false, code: "failed", message: "SVAGA recheck не удался" };
  }
}
