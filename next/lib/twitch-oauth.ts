import { randomBytes } from "node:crypto";

export const TWITCH_OAUTH_STATE_COOKIE = "twitch_oauth_state";
/** Safe relative path for post-login redirect (e.g. /competitive). */
export const TWITCH_OAUTH_NEXT_COOKIE = "twitch_oauth_next";
export const TWITCH_OAUTH_STATE_MAX_AGE_SEC = 10 * 60;

export type TwitchOAuthConfig = Readonly<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}>;

export type TwitchHelixUser = Readonly<{
  id: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
}>;

export function readTwitchOAuthConfig(): TwitchOAuthConfig | null {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TWITCH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

/** 32 random bytes as hex (64 chars) for OAuth CSRF state. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

export function buildTwitchAuthorizeUrl(
  config: Pick<TwitchOAuthConfig, "clientId" | "redirectUri">,
  state: string,
): string {
  const url = new URL("https://id.twitch.tv/oauth2/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  // Identity only; no channel scopes required for Helix /users (self).
  url.searchParams.set("scope", "");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeTwitchCode(
  config: TwitchOAuthConfig,
  code: string,
): Promise<{ accessToken: string } | { error: string }> {
  try {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });

    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[twitch-oauth] token exchange failed status=${res.status}`);
      return { error: "token_exchange_failed" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { error: "invalid_token_response" };
    }

    if (!data || typeof data !== "object") {
      return { error: "invalid_token_response" };
    }

    const accessToken = (data as Record<string, unknown>).access_token;
    if (typeof accessToken !== "string" || accessToken.length === 0) {
      return { error: "invalid_token_response" };
    }

    return { accessToken };
  } catch (error) {
    console.error("[twitch-oauth] token exchange error:", error);
    return { error: "token_exchange_error" };
  }
}

export async function fetchTwitchHelixUser(
  clientId: string,
  accessToken: string,
): Promise<TwitchHelixUser | { error: string }> {
  try {
    const res = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[twitch-oauth] helix users failed status=${res.status}`);
      return { error: "helix_failed" };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { error: "invalid_helix_response" };
    }

    if (!data || typeof data !== "object") {
      return { error: "invalid_helix_response" };
    }

    const list = (data as Record<string, unknown>).data;
    if (!Array.isArray(list) || list.length === 0) {
      return { error: "helix_empty" };
    }

    const raw = list[0];
    if (!raw || typeof raw !== "object") {
      return { error: "invalid_helix_response" };
    }

    const row = raw as Record<string, unknown>;
    const id = row.id;
    const login = row.login;
    if (typeof id !== "string" || id.length === 0) {
      return { error: "invalid_helix_response" };
    }
    if (typeof login !== "string" || login.length === 0) {
      return { error: "invalid_helix_response" };
    }

    const displayName =
      typeof row.display_name === "string" && row.display_name.length > 0
        ? row.display_name
        : login;
    const profileImageUrl =
      typeof row.profile_image_url === "string" && row.profile_image_url.length > 0
        ? row.profile_image_url
        : null;

    return {
      id,
      login,
      displayName,
      profileImageUrl,
    };
  } catch (error) {
    console.error("[twitch-oauth] helix users error:", error);
    return { error: "helix_error" };
  }
}

export function twitchOAuthCookieOptions(maxAgeSec: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const secure =
    process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}
