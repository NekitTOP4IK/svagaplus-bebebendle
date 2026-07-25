import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "bebebendle_access";
export const REFRESH_COOKIE = "bebebendle_refresh";
export const LEGACY_COOKIE = "bebebendle_session";

export type SessionCookieOptions = Readonly<{
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
  expires?: Date;
}>;

export type CookieWriter = Readonly<{
  set(name: string, value: string, options: SessionCookieOptions): unknown;
}>;

export type IssuedSession = Readonly<{
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}>;

function secureCookies(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

function commonCookieOptions(): Omit<SessionCookieOptions, "maxAge" | "expires"> {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/" };
}

export function writeSessionCookies(
  writer: CookieWriter,
  issued: IssuedSession,
  now = new Date(),
): void {
  const common = commonCookieOptions();
  writer.set(ACCESS_COOKIE, issued.accessToken, { ...common, maxAge: 60 * 60 });
  writer.set(REFRESH_COOKIE, issued.refreshToken, {
    ...common,
    maxAge: Math.max(0, Math.floor((issued.refreshExpiresAt.getTime() - now.getTime()) / 1000)),
  });
  writer.set(LEGACY_COOKIE, "", { ...common, expires: new Date(0) });
}

export function setSessionCookies(
  response: NextResponse,
  issued: IssuedSession,
  now = new Date(),
): void {
  writeSessionCookies(response.cookies, issued, now);
}

export function clearSessionCookies(writer: CookieWriter): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE]) {
    writer.set(name, "", { ...commonCookieOptions(), expires: new Date(0) });
  }
}
