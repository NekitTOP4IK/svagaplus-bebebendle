import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import {
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";

export async function POST(request: Request) {
  const rateLimitResult = await checkRateLimit(
    `auth-refresh:${getClientIp(request)}`,
    30,
    60,
    "closed",
  );
  if (!rateLimitResult.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "session_not_configured" }, { status: 503 });
  }
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return NextResponse.json({ error: "refresh_required" }, { status: 401 });

  const result = await createSessionManager(sessionRepository, { sessionSecret: secret }).rotate(refreshToken);
  if (result.status !== "ok") {
    const response = NextResponse.json({ error: result.status }, { status: 401 });
    clearSessionCookies(response);
    return response;
  }
  const response = NextResponse.json({ success: true });
  setSessionCookies(response, result);
  return response;
}
