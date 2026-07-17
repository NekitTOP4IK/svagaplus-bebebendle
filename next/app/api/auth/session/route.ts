import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth-server";
import { clearSessionCookies, REFRESH_COOKIE } from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramPhotoUrl: user.telegramPhotoUrl,
      displayName: user.displayName,
      role: user.role,
      isSubscriber: user.isSubscriber,
    },
  });
}

/** Revoke current session and clear cookies. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  try {
    const secret = process.env.SESSION_SECRET;
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
    if (secret && secret.length >= 32 && refreshToken) {
      const manager = createSessionManager(sessionRepository, { sessionSecret: secret });
      await manager.revoke(refreshToken);
    }
  } catch (error) {
    console.error("[auth/session] logout revoke failed", error);
  }
  clearSessionCookies(response);
  return response;
}
