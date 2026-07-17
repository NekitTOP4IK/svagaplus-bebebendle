import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import {
  dailyScrandles,
  db,
  scrandleVotes,
  scrans,
  telegramVotes,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";

const BOT_TOKEN = process.env.BOT_TOKEN;

async function sendDeletionNotification(
  telegramId: string,
  scranName: string,
  comment: string,
): Promise<void> {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const message = `❌ УВЫ, ваше блюдо «${scranName}» ЗАБАНЕНО по причине: ${comment}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("Failed to send deletion notification:", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot token not configured" }, { status: 500 });
  }

  try {
    const { id } = await params;
    const scranId = parseInt(id, 10);
    if (isNaN(scranId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { comment?: unknown };
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!comment) {
      return NextResponse.json({ error: "Комментарий обязателен" }, { status: 400 });
    }

    const rows = await db
      .select({ telegramId: scrans.telegramId, name: scrans.name })
      .from(scrans)
      .where(eq(scrans.id, scranId));

    if (rows.length === 0) {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }

    const { telegramId, name } = rows[0];

    await db.transaction(async (tx) => {
      await tx.delete(telegramVotes).where(eq(telegramVotes.scranId, scranId));
      await tx.delete(scrandleVotes).where(eq(scrandleVotes.chosenScranId, scranId));
      await tx
        .delete(dailyScrandles)
        .where(or(eq(dailyScrandles.scranAId, scranId), eq(dailyScrandles.scranBId, scranId)));
      await tx.delete(scrans).where(eq(scrans.id, scranId));
    });

    if (telegramId) {
      await sendDeletionNotification(telegramId, name, comment);
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "scran.delete",
      scranId,
      targetTelegramId: telegramId,
      details: JSON.stringify({ name, comment }),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scran:", error);
    return NextResponse.json({ error: "Failed to delete scran" }, { status: 500 });
  }
}

/** PATCH: edit name/description/price (admin) or restore rejected to pending (mod+) */
export async function PATCH(
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
      name?: string;
      description?: string | null;
      price?: number;
      restore?: boolean;
    };

    const existing = await db.select().from(scrans).where(eq(scrans.id, scranId)).limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }

    if (body.restore === true) {
      await db
        .update(scrans)
        .set({
          rejected: false,
          rejectReason: null,
          rejectedAt: null,
          rejectedByUserId: null,
          approved: false,
        })
        .where(eq(scrans.id, scranId));
      await writeAuditLog({
        actorUserId: user.id,
        action: "scran.restore",
        scranId,
        targetTelegramId: existing[0].telegramId,
      });
      return NextResponse.json({ success: true, restored: true });
    }

    if (user.role !== "admin") {
      return NextResponse.json({ error: "Only admin can edit fields" }, { status: 403 });
    }

    const patch: Partial<typeof scrans.$inferInsert> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 200);
    }
    if (body.description !== undefined) {
      patch.description =
        body.description === null ? null : String(body.description).trim().slice(0, 1000);
    }
    if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
      patch.price = body.price;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await db.update(scrans).set(patch).where(eq(scrans.id, scranId));
    await writeAuditLog({
      actorUserId: user.id,
      action: "scran.edit",
      scranId,
      targetTelegramId: existing[0].telegramId,
      details: JSON.stringify(patch),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error patching scran:", error);
    return NextResponse.json({ error: "Failed to update scran" }, { status: 500 });
  }
}
