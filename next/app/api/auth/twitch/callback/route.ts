import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import { db, users } from "@/db/schema";
import { setSessionCookies } from "@/lib/session-cookies";
import { createSessionManager } from "@/lib/session-manager";
import { sessionRepository } from "@/lib/session-repository";
import { getTwitchIdentity } from "@/lib/svaga-twitch";
import { sanitizeNextPath } from "@/lib/safe-next-path";
import {
  TWITCH_OAUTH_NEXT_COOKIE,
  TWITCH_OAUTH_STATE_COOKIE,
  exchangeTwitchCode,
  fetchTwitchHelixUser,
  readTwitchOAuthConfig,
  twitchOAuthCookieOptions,
} from "@/lib/twitch-oauth";
import { getPublicSiteOrigin } from "@/lib/utils";

function clearOAuthCookies(response: NextResponse): void {
  const clear = { ...twitchOAuthCookieOptions(0), maxAge: 0 };
  response.cookies.set(TWITCH_OAUTH_STATE_COOKIE, "", clear);
  response.cookies.set(TWITCH_OAUTH_NEXT_COOKIE, "", clear);
}

/**
 * Post-auth redirect. Default /profile; competitive gate sets next=/competitive.
 * Errors with next under /competitive stay on competitive auth UI.
 */
function postAuthRedirect(
  request: Request,
  nextPath: string,
  params?: Record<string, string>,
): NextResponse {
  const origin = getPublicSiteOrigin(request);
  const safeNext = sanitizeNextPath(nextPath, "/profile");
  const hasError = Boolean(params && Object.keys(params).length > 0);
  // On OAuth errors, if next was competitive, bounce back to competitive gate with query.
  const path =
    hasError && safeNext.startsWith("/competitive")
      ? "/competitive"
      : hasError
        ? "/profile"
        : safeNext;
  const url = new URL(path, `${origin}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  if (hasError && safeNext.startsWith("/competitive") && safeNext !== "/competitive") {
    url.searchParams.set("next", safeNext);
  }
  const response = NextResponse.redirect(url);
  clearOAuthCookies(response);
  return response;
}

function clearStateResponse(
  body: Record<string, string>,
  status: number,
): NextResponse {
  const response = NextResponse.json(body, { status });
  clearOAuthCookies(response);
  return response;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const nextFromCookie =
    cookieStore.get(TWITCH_OAUTH_NEXT_COOKIE)?.value ?? "/profile";
  const nextPath = sanitizeNextPath(nextFromCookie, "/profile");

  const config = readTwitchOAuthConfig();
  if (!config) {
    console.warn("[twitch-auth] callback: Twitch OAuth not configured");
    return postAuthRedirect(request, nextPath, { twitch_error: "config" });
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
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  const stateCookie = cookieStore.get(TWITCH_OAUTH_STATE_COOKIE)?.value ?? null;

  if (oauthError) {
    console.warn(`[twitch-auth] oauth provider error=${oauthError}`);
    return postAuthRedirect(request, nextPath, { twitch_error: "denied" });
  }

  if (!state || !stateCookie || state !== stateCookie) {
    console.warn("[twitch-auth] state mismatch or missing");
    return clearStateResponse({ error: "invalid_state" }, 400);
  }

  if (!code) {
    console.warn("[twitch-auth] missing code");
    return postAuthRedirect(request, nextPath, { twitch_error: "oauth" });
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    console.error("[twitch-auth] SESSION_SECRET not configured");
    return postAuthRedirect(request, nextPath, { twitch_error: "config" });
  }

  try {
    const tokenResult = await exchangeTwitchCode(config, code);
    if ("error" in tokenResult) {
      return postAuthRedirect(request, nextPath, { twitch_error: "oauth" });
    }

    const helixUser = await fetchTwitchHelixUser(
      config.clientId,
      tokenResult.accessToken,
    );
    if ("error" in helixUser) {
      return postAuthRedirect(request, nextPath, { twitch_error: "oauth" });
    }

    const identity = await getTwitchIdentity(helixUser.id);
    if (identity.status === "unavailable") {
      return postAuthRedirect(request, nextPath, { twitch_error: "svaga" });
    }

    if (!identity.linked) {
      const login = identity.twitchUsername || helixUser.login;
      return postAuthRedirect(request, nextPath, {
        twitch_error: "need_telegram_link",
        login,
      });
    }

    const telegramId = identity.telegramUserId;
    const fallbackDisplayName =
      identity.twitchUsername || helixUser.login || helixUser.displayName;
    const avatarFromSvaga = identity.avatarUrl;
    const avatarFromHelix = helixUser.profileImageUrl;
    const photoUrl = avatarFromSvaga || avatarFromHelix || null;

    const existing = await db
      .select({
        id: users.id,
        telegramId: users.telegramId,
        role: users.role,
        displayName: users.displayName,
        telegramPhotoUrl: users.telegramPhotoUrl,
      })
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);

    let userId: number;
    let userTelegramId: number;
    let userRole: string;

    if (existing[0]) {
      userId = existing[0].id;
      userTelegramId = existing[0].telegramId;
      userRole = existing[0].role;

      // Prefer existing identity fields; fill photo only if missing.
      const patch: {
        updatedAt: Date;
        telegramPhotoUrl?: string;
      } = { updatedAt: new Date() };
      if (!existing[0].telegramPhotoUrl && photoUrl) {
        patch.telegramPhotoUrl = photoUrl;
      }
      await db.update(users).set(patch).where(eq(users.id, userId));
    } else {
      const inserted = await db
        .insert(users)
        .values({
          telegramId,
          telegramUsername: null,
          telegramPhotoUrl: photoUrl,
          displayName: fallbackDisplayName,
          role: "player",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({
          id: users.id,
          telegramId: users.telegramId,
          role: users.role,
        });

      const created = inserted[0];
      if (!created) {
        console.error("[twitch-auth] insert returned no row");
        return postAuthRedirect(request, nextPath, { twitch_error: "oauth" });
      }
      userId = created.id;
      userTelegramId = created.telegramId;
      userRole = created.role;
    }

    const manager = createSessionManager(sessionRepository, {
      sessionSecret: secret,
    });
    const issued = await manager.create(
      userId,
      String(userTelegramId),
      request.headers.get("user-agent"),
    );

    const response = postAuthRedirect(request, nextPath);
    setSessionCookies(response, issued);
    console.log(
      `[twitch-auth] session issued userId=${userId} telegramId=${userTelegramId} role=${userRole} next=${nextPath}`,
    );
    return response;
  } catch (error) {
    console.error("[twitch-auth] callback error:", error);
    return postAuthRedirect(request, nextPath, { twitch_error: "oauth" });
  }
}
