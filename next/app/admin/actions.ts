"use server";

import { db, scrans, users, telegramVotes, scrandleVotes, dailyScrandles } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth-server";

const BOT_TOKEN = process.env.BOT_TOKEN;

interface ApproveScranResult {
  success: boolean;
  message?: string;
}

export async function approveScran(id: number): Promise<ApproveScranResult> {
  try {
    await requireRole("moderator");
  } catch {
    return { success: false, message: "Unauthorized" };
  }

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

export async function deleteScran(
  id: number,
  comment: string
): Promise<ApproveScranResult> {
  try {
    await requireRole("admin");
  } catch {
    return { success: false, message: "Unauthorized" };
  }

  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is not set");
    return { success: false, message: "Bot token not configured" };
  }

  const trimmedComment = comment.trim();
  if (!trimmedComment) {
    return { success: false, message: "Комментарий обязателен" };
  }

  try {
    // 1. Fetch scran to get telegramId + name for notification
    const rows = await db
      .select({ telegramId: scrans.telegramId, name: scrans.name })
      .from(scrans)
      .where(eq(scrans.id, id));

    if (rows.length === 0) {
      return { success: false, message: "Scran not found" };
    }

    const { telegramId, name } = rows[0];

    // 2. Cascade delete: telegramVotes, scrandleVotes, dailyScrandles, scrans
    await db.transaction(async (tx) => {
      await tx.delete(telegramVotes).where(eq(telegramVotes.scranId, id));
      await tx.delete(scrandleVotes).where(eq(scrandleVotes.chosenScranId, id));
      await tx
        .delete(dailyScrandles)
        .where(
          or(eq(dailyScrandles.scranAId, id), eq(dailyScrandles.scranBId, id))
        );
      await tx.delete(scrans).where(eq(scrans.id, id));
    });

    // 3. Send notification to proposer if telegramId exists
    if (telegramId) {
      await sendDeletionNotification(telegramId, name, trimmedComment);
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting scran:", error);
    return { success: false, message: "Failed to delete scran" };
  }
}

async function sendDeletionNotification(
  telegramId: string,
  scranName: string,
  comment: string
): Promise<void> {
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
    // Don't fail the whole action if notification fails
  }
}

// Minimal admin-only users management for Task 7 (admins only)
export interface AdminUser {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  displayName: string | null;
  role: "player" | "moderator" | "admin";
  createdAt: Date | null;
}

export async function getUsers(): Promise<AdminUser[]> {
  try {
    await requireRole("admin");
  } catch {
    return [];
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.id))
      .limit(200);

    return rows.map((r) => ({
      id: r.id,
      telegramId: r.telegramId,
      telegramUsername: r.telegramUsername,
      displayName: r.displayName,
      role: r.role as AdminUser["role"],
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

export async function updateUserRole(
  userId: number,
  newRole: "player" | "moderator" | "admin"
): Promise<{ success: boolean; message?: string }> {
  try {
    await requireRole("admin");
  } catch {
    return { success: false, message: "Unauthorized" };
  }

  if (!userId || userId <= 0) {
    return { success: false, message: "Invalid user id" };
  }

  try {
    await db
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error("Error updating user role:", error);
    return { success: false, message: "Failed to update role" };
  }
}
