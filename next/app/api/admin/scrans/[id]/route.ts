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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scran:", error);
    return NextResponse.json({ error: "Failed to delete scran" }, { status: 500 });
  }
}
