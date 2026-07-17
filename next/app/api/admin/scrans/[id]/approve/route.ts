import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, scrans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";

const BOT_TOKEN = process.env.BOT_TOKEN;

async function sendApprovalNotification(telegramId: string, scranName: string): Promise<void> {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const message = `✅ ${scranName} — одобрено и опубликовано!`;
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
    console.error("Failed to send approval notification:", error);
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const scranId = parseInt(id, 10);

    if (isNaN(scranId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const result = await db
      .update(scrans)
      .set({ approved: true, rejected: false })
      .where(eq(scrans.id, scranId))
      .returning({ telegramId: scrans.telegramId, name: scrans.name });

    if (result.length === 0) {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }

    if (result[0].telegramId) {
      await sendApprovalNotification(result[0].telegramId, result[0].name);
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "scran.approve",
      scranId,
      targetTelegramId: result[0].telegramId,
      details: result[0].name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error approving scran:", error);
    return NextResponse.json({ error: "Failed to approve scran" }, { status: 500 });
  }
}
