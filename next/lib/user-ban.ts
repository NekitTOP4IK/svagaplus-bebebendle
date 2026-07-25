import { and, eq } from "drizzle-orm";
import { db, scrans, userBans, users } from "@/db/schema";
import { writeAuditLog } from "@/lib/moderation-audit";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import {
  buildBanNotifyMessage,
  pendingRejectReasonForBan,
  type BanReasonCode,
} from "@/lib/ban-reasons";

const BOT_TOKEN = process.env.BOT_TOKEN;

export async function isTelegramBanned(telegramId: string): Promise<boolean> {
  const rows = await db
    .select({ telegramId: userBans.telegramId })
    .from(userBans)
    .where(and(eq(userBans.telegramId, telegramId), eq(userBans.active, true)))
    .limit(1);
  return rows.length > 0;
}

export async function getActiveBan(telegramId: string) {
  const rows = await db
    .select()
    .from(userBans)
    .where(and(eq(userBans.telegramId, telegramId), eq(userBans.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

async function notifyBanned(telegramId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("[ban] notify failed", error);
  }
}

function moderatorLabel(user: {
  displayName: string | null;
  telegramUsername: string | null;
  id: number;
}): string {
  return (
    user.displayName?.trim() ||
    (user.telegramUsername ? `@${user.telegramUsername}` : null) ||
    `mod#${user.id}`
  );
}

export type BanUserResult = {
  telegramId: string;
  reason: string;
  reasonCode: BanReasonCode;
  rejectedPending: number;
  alreadyBanned: boolean;
};

/**
 * Ban by telegram id: upsert active ban, reject all pending scrans, notify, audit.
 */
export async function banTelegramUser(input: {
  telegramId: string;
  reason: string;
  reasonCode: BanReasonCode;
  actor: {
    id: number;
    displayName: string | null;
    telegramUsername: string | null;
  };
}): Promise<BanUserResult> {
  const telegramId = input.telegramId.trim();
  if (!telegramId) {
    throw new Error("telegram_id required");
  }

  const existing = await getActiveBan(telegramId);
  if (existing) {
    return {
      telegramId,
      reason: existing.reason,
      reasonCode: input.reasonCode,
      rejectedPending: 0,
      alreadyBanned: true,
    };
  }

  const modLabel = moderatorLabel(input.actor);
  const rejectReason = pendingRejectReasonForBan(modLabel);
  const now = new Date();

  await db
    .insert(userBans)
    .values({
      telegramId,
      reason: input.reason,
      reasonCode: input.reasonCode,
      bannedByUserId: input.actor.id,
      bannedAt: now,
      active: true,
    })
    .onConflictDoUpdate({
      target: userBans.telegramId,
      set: {
        reason: input.reason,
        reasonCode: input.reasonCode,
        bannedByUserId: input.actor.id,
        bannedAt: now,
        active: true,
      },
    });

  const pending = await db
    .update(scrans)
    .set({
      approved: false,
      rejected: true,
      rejectReason,
      rejectedAt: now,
      rejectedByUserId: input.actor.id,
    })
    .where(
      and(
        eq(scrans.telegramId, telegramId),
        eq(scrans.approved, false),
        eq(scrans.rejected, false),
      ),
    )
    .returning({ id: scrans.id });

  for (const p of pending) {
    await writeAuditLog({
      actorUserId: input.actor.id,
      action: AUDIT_ACTIONS.SCRAN_REJECT,
      scranId: p.id,
      targetTelegramId: telegramId,
      details: JSON.stringify({
        reason: "user_banned",
        system: true,
        rejectReason,
      }),
    });
  }

  await writeAuditLog({
    actorUserId: input.actor.id,
    action: AUDIT_ACTIONS.USER_BAN,
    scranId: null,
    targetTelegramId: telegramId,
    details: JSON.stringify({
      reason: input.reason,
      reasonCode: input.reasonCode,
      rejectedPending: pending.length,
      moderator: modLabel,
    }),
  });

  await notifyBanned(telegramId, buildBanNotifyMessage(input.reason));

  return {
    telegramId,
    reason: input.reason,
    reasonCode: input.reasonCode,
    rejectedPending: pending.length,
    alreadyBanned: false,
  };
}

/** Ensure users table import stays used if tree-shaken in some builds — re-export helper. */
export async function findUserByTelegram(telegramId: string) {
  const n = Number(telegramId);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rows = await db.select().from(users).where(eq(users.telegramId, n)).limit(1);
  return rows[0] ?? null;
}
