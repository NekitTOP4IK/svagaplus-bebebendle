"use server";

import { db, scrans } from "@/db/schema";
import { eq } from "drizzle-orm";

const BOT_TOKEN = process.env.BOT_TOKEN;

interface ApproveScranResult {
  success: boolean;
  message?: string;
}

export async function approveScran(id: number): Promise<ApproveScranResult> {
  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not set");
    return { success: false, message: "Bot token not configured" };
  }

  try {
    // 1. Update approved status
    const result = await db
      .update(scrans)
      .set({ approved: true })
      .where(eq(scrans.id, id))
      .returning({ telegramId: scrans.telegramId, name: scrans.name });

    if (result.length === 0) {
      return { success: false, message: "Scran not found" };
    }

    const telegramId = result[0].telegramId;

    // 2. Send notification to user if telegramId exists
    if (telegramId) {
      await sendApprovalNotification(telegramId, result[0].name);
    }

    return { success: true };
  } catch (error) {
    console.error("Error approving scran:", error);
    return { success: false, message: "Failed to approve scran" };
  }
}

async function sendApprovalNotification(telegramId: string, scranName: string): Promise<void> {
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
    // Don't fail the whole action if notification fails
  }
}
