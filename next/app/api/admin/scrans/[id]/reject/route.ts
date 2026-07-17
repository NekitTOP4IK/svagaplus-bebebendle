import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, scrans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import {
  buildRejectMessage,
  isRejectReasonCode,
  type RejectReasonCode,
} from "@/lib/reject-reasons";
import { writeAuditLog } from "@/lib/moderation-audit";

const BOT_TOKEN = process.env.BOT_TOKEN;

async function notifyRejected(telegramId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("Failed to send reject notification:", error);
  }
}

/** Soft-reject pending submission. Moderators and admins. Not a hard delete. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const scranId = parseInt(id, 10);
    if (Number.isNaN(scranId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
      note?: string;
    };
    const reasonCode: RejectReasonCode =
      typeof body.reason === "string" && isRejectReasonCode(body.reason)
        ? body.reason
        : "other";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 280) : "";

    const rows = await db
      .select({
        telegramId: scrans.telegramId,
        name: scrans.name,
        approved: scrans.approved,
        rejected: scrans.rejected,
      })
      .from(scrans)
      .where(eq(scrans.id, scranId))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }

    await db
      .update(scrans)
      .set({
        approved: false,
        rejected: true,
        rejectReason: note ? `${reasonCode}: ${note}` : reasonCode,
        rejectedAt: new Date(),
        rejectedByUserId: user.id,
      })
      .where(eq(scrans.id, scranId));

    const { telegramId, name } = rows[0];
    const message = buildRejectMessage(name, reasonCode, note || undefined);
    if (telegramId) {
      await notifyRejected(telegramId, message);
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "scran.reject",
      scranId,
      targetTelegramId: telegramId,
      details: JSON.stringify({ reason: reasonCode, note: note || null }),
    });

    return NextResponse.json({ success: true, reason: reasonCode });
  } catch (error) {
    console.error("Error rejecting scran:", error);
    return NextResponse.json({ error: "Failed to reject scran" }, { status: 500 });
  }
}
