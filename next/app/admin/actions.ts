"use server";

import { db, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth-server";

// Minimal admin-only users management (admins only)
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
