import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "bebebendle_access";
export const REFRESH_COOKIE = "bebebendle_refresh";
export const LEGACY_COOKIE = "bebebendle_session";

function secureCookies(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

export function setSessionCookies(
  response: NextResponse,
  issued: { accessToken: string; refreshToken: string; refreshExpiresAt: Date },
  now = new Date(),
): void {
  const common = { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/" };
  response.cookies.set(ACCESS_COOKIE, issued.accessToken, { ...common, maxAge: 60 * 60 });
  response.cookies.set(REFRESH_COOKIE, issued.refreshToken, {
    ...common,
    maxAge: Math.max(0, Math.floor((issued.refreshExpiresAt.getTime() - now.getTime()) / 1000)),
  });
  response.cookies.set(LEGACY_COOKIE, "", { ...common, expires: new Date(0) });
}

export function clearSessionCookies(response: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: secureCookies(),
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
  }
}
