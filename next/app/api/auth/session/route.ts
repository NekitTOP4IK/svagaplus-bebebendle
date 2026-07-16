import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth-server";
import {
  clearSessionCookies,
  REFRESH_COOKIE,
} from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      displayName: user.displayName,
      role: user.role,
    },
  });
}

export async function DELETE() {
  const secret = process.env.SESSION_SECRET;
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;

  if (secret && secret.length >= 32 && refreshToken) {
    await createSessionManager(sessionRepository, { sessionSecret: secret }).revoke(
      refreshToken,
    );
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
