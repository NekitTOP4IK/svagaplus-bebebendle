// @vitest-environment node
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  LEGACY_COOKIE,
  clearSessionCookies,
  setSessionCookies,
  writeSessionCookies,
} from "@/lib/session-cookies";

function cookieMap(response: NextResponse): Map<string, { value: string; options: Record<string, unknown> }> {
  const map = new Map<string, { value: string; options: Record<string, unknown> }>();
  for (const cookie of response.cookies.getAll()) {
    map.set(cookie.name, { value: cookie.value, options: cookie as unknown as Record<string, unknown> });
  }
  // NextResponse stores options separately; inspect Set-Cookie headers for attributes
  const headers = response.headers.getSetCookie?.() ?? [];
  for (const header of headers) {
    const [pair, ...attrs] = header.split(";");
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    const options: Record<string, unknown> = {};
    for (const attr of attrs) {
      const [k, v] = attr.trim().split("=");
      const key = k.toLowerCase();
      if (key === "max-age") options.maxAge = Number(v);
      else if (key === "httponly") options.httpOnly = true;
      else if (key === "secure") options.secure = true;
      else if (key === "samesite") options.sameSite = v?.toLowerCase();
      else if (key === "path") options.path = v;
      else if (key === "expires") options.expires = v;
    }
    map.set(name, { value, options });
  }
  return map;
}

describe("session cookies", () => {
  const originalEnv = process.env.APP_ENV;

  beforeEach(() => {
    delete process.env.APP_ENV;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = originalEnv;
  });

  it("sets secure cookies in staging/production and not in development", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const issued = {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      refreshExpiresAt: new Date("2026-07-16T13:00:00Z"),
    };

    process.env.APP_ENV = "development";
    const dev = NextResponse.json({ ok: true });
    setSessionCookies(dev, issued, now);
    const devCookies = cookieMap(dev);
    expect(devCookies.get(ACCESS_COOKIE)?.options.secure).toBeUndefined();

    process.env.APP_ENV = "staging";
    const staging = NextResponse.json({ ok: true });
    setSessionCookies(staging, issued, now);
    const stagingCookies = cookieMap(staging);
    expect(stagingCookies.get(ACCESS_COOKIE)?.options.secure).toBe(true);
    expect(stagingCookies.get(REFRESH_COOKIE)?.options.secure).toBe(true);

    process.env.APP_ENV = "production";
    const prod = NextResponse.json({ ok: true });
    setSessionCookies(prod, issued, now);
    expect(cookieMap(prod).get(ACCESS_COOKIE)?.options.secure).toBe(true);
  });

  it("uses 3600s access max-age and caps refresh max-age to supplied expiry", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const response = NextResponse.json({ ok: true });
    setSessionCookies(
      response,
      {
        accessToken: "a",
        refreshToken: "r",
        refreshExpiresAt: new Date("2026-07-16T12:30:00Z"),
      },
      now,
    );
    const cookies = cookieMap(response);
    expect(cookies.get(ACCESS_COOKIE)?.options.maxAge).toBe(3600);
    expect(cookies.get(REFRESH_COOKIE)?.options.maxAge).toBe(1800);
  });

  it("clears access, refresh, and legacy session cookies", () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookies(response.cookies);
    const cookies = cookieMap(response);
    expect(cookies.has(ACCESS_COOKIE)).toBe(true);
    expect(cookies.has(REFRESH_COOKIE)).toBe(true);
    expect(cookies.has(LEGACY_COOKIE)).toBe(true);
    expect(cookies.get(ACCESS_COOKIE)?.value).toBe("");
    expect(cookies.get(REFRESH_COOKIE)?.value).toBe("");
    expect(cookies.get(LEGACY_COOKIE)?.value).toBe("");
    expect(cookies.get(ACCESS_COOKIE)?.options.expires).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookies.get(REFRESH_COOKIE)?.options.expires).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookies.get(LEGACY_COOKIE)?.options.expires).toBe("Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("writes and clears the same cookie contract through a Server Action writer", () => {
    const writer = { set: vi.fn() };
    const now = new Date("2026-07-16T12:00:00Z");

    writeSessionCookies(writer, {
      accessToken: "access",
      refreshToken: "refresh",
      refreshExpiresAt: new Date("2026-07-16T13:30:00Z"),
    }, now);

    expect(writer.set).toHaveBeenNthCalledWith(
      1,
      ACCESS_COOKIE,
      "access",
      expect.objectContaining({ httpOnly: true, maxAge: 3600, sameSite: "lax", path: "/" }),
    );
    expect(writer.set).toHaveBeenNthCalledWith(
      2,
      REFRESH_COOKIE,
      "refresh",
      expect.objectContaining({ httpOnly: true, maxAge: 5400, sameSite: "lax", path: "/" }),
    );

    clearSessionCookies(writer);

    expect(writer.set).toHaveBeenCalledWith(
      LEGACY_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0), httpOnly: true, path: "/" }),
    );
  });
});
