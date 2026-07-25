import { db, moderationAuditLog } from "@/db/schema";
import type { AuditAction } from "@/lib/audit-actions";

export async function writeAuditLog(input: {
  actorUserId: number | null;
  action: AuditAction;
  scranId?: number | null;
  targetTelegramId?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await db.insert(moderationAuditLog).values({
      actorUserId: input.actorUserId,
      action: input.action,
      scranId: input.scranId ?? null,
      targetTelegramId: input.targetTelegramId ?? null,
      details: input.details ?? null,
    });
  } catch (error) {
    console.error("[moderation-audit] failed to write log", error);
  }
}
