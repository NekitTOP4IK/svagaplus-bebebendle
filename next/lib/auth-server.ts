import { cookies } from "next/headers";
import { db, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface CurrentUser {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  displayName: string | null;
  role: "player" | "moderator" | "admin";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("bebebendle_session");

  if (!sessionCookie?.value) {
    return null;
  }

  const telegramId = parseInt(sessionCookie.value, 10);
  if (isNaN(telegramId) || telegramId <= 0) {
    return null;
  }

  try {
    const result = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const u = result[0];
    return {
      id: u.id,
      telegramId: u.telegramId,
      telegramUsername: u.telegramUsername,
      displayName: u.displayName,
      role: u.role as CurrentUser["role"],
    };
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }
}

export async function requireRole(
  role: "moderator" | "admin"
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: no session");
  }
  // Allow the requested role or admin (admin can do moderator actions)
  const allowed = role === "admin" ? ["admin"] : ["moderator", "admin"];
  if (!allowed.includes(user.role)) {
    throw new Error(`Unauthorized: requires ${role} role`);
  }
  return user;
}
