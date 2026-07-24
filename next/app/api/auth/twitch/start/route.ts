import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import { sanitizeNextPath } from "@/lib/safe-next-path";
import {
  TWITCH_OAUTH_NEXT_COOKIE,
  TWITCH_OAUTH_STATE_COOKIE,
  TWITCH_OAUTH_STATE_MAX_AGE_SEC,
  buildTwitchAuthorizeUrl,
  generateOAuthState,
  readTwitchOAuthConfig,
  twitchOAuthCookieOptions,
} from "@/lib/twitch-oauth";

export async function GET(request: Request) {
  const config = readTwitchOAuthConfig();
  if (!config) {
    console.warn(
      "[twitch-auth] start: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET / TWITCH_REDIRECT_URI not configured",
    );
    return NextResponse.json(
      { error: "twitch_not_configured" },
      { status: 503 },
    );
  }

  const rateLimitResult = await checkRateLimit(
    `auth:${getClientIp(request)}`,
    10,
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

  const requestUrl = new URL(request.url);
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"), "/profile");

  const state = generateOAuthState();
  const authorizeUrl = buildTwitchAuthorizeUrl(config, state);
  const cookieOpts = twitchOAuthCookieOptions(TWITCH_OAUTH_STATE_MAX_AGE_SEC);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(TWITCH_OAUTH_STATE_COOKIE, state, cookieOpts);
  response.cookies.set(TWITCH_OAUTH_NEXT_COOKIE, nextPath, cookieOpts);
  return response;
}
