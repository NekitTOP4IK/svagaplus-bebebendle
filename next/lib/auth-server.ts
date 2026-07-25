import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, users, userSessions } from "@/db/schema";
import { ACCESS_COOKIE } from "@/lib/session-cookies";
import { verifyAccessToken } from "@/lib/session-token";

export interface CurrentUser {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  displayName: string | null;
  /** Competitive leaderboard nick (optional). */
  competitiveDisplayName: string | null;
  role: "player" | "streamer" | "moderator" | "admin";
  isSubscriber: boolean | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return null;
  }

  const claims = verifyAccessToken(accessToken, secret);
  if (!claims) {
    return null;
  }

  try {
    const now = new Date();
    const result = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        telegramUsername: users.telegramUsername,
        telegramPhotoUrl: users.telegramPhotoUrl,
        displayName: users.displayName,
        competitiveDisplayName: users.competitiveDisplayName,
        role: users.role,
        isSubscriber: users.isSubscriber,
      })
      .from(users)
      .innerJoin(userSessions, eq(userSessions.userId, users.id))
      .where(
        and(
          eq(users.id, claims.userId),
          eq(userSessions.id, claims.sessionId),
          isNull(userSessions.revokedAt),
          gt(userSessions.absoluteExpiresAt, now),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const u = result[0];
    // Claims and DB must agree on Telegram identity.
    if (String(u.telegramId) !== claims.telegramId) {
      return null;
    }

    return {
      id: u.id,
      telegramId: u.telegramId,
      telegramUsername: u.telegramUsername,
      telegramPhotoUrl: u.telegramPhotoUrl,
      displayName: u.displayName,
      competitiveDisplayName: u.competitiveDisplayName,
      role: u.role as CurrentUser["role"],
      isSubscriber: u.isSubscriber,
    };
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }
}

/** Staff = moderator or admin (admin panel access). */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === "moderator" || role === "admin";
}

export async function requireRole(
  role: "moderator" | "admin"
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: no session");
  }
  // Allow the requested role or admin (admin can do moderator actions)
  const allowed = role === "admin" ? user.role === "admin" : isStaffRole(user.role);
  if (!allowed) {
    throw new Error(`Unauthorized: requires ${role} role`);
  }
  return user;
}

/** Session required and role is moderator or admin. */
export async function requireStaff(): Promise<CurrentUser> {
  return requireRole("moderator");
}
