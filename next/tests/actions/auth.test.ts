// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_COOKIE, LEGACY_COOKIE, REFRESH_COOKIE } from "@/lib/session-cookies";
import { ensureSession, logoutCurrentSession } from "@/app/actions/auth";

const actionDependencies = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  cookieSet: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = actionDependencies.cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: actionDependencies.cookieSet,
  })),
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "127.0.0.1" })),
}));

vi.mock("@/app/api/middleware/rateLimit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, resetAt: Date.now() + 60_000 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/session-manager", () => ({
  createSessionManager: vi.fn(() => ({
    rotate: actionDependencies.rotate,
    revoke: actionDependencies.revoke,
  })),
}));

vi.mock("@/lib/session-repository", () => ({ sessionRepository: {} }));

vi.mock("@/lib/session-token", () => ({
  verifyAccessToken: vi.fn((token: string) => (
    token === "new-access-token" ? { expiresAt: 1_784_206_800 } : null
  )),
}));

describe("authentication server actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
    process.env.SESSION_SECRET = "s".repeat(32);
    actionDependencies.cookieValues.clear();
    actionDependencies.cookieSet.mockReset();
    actionDependencies.rotate.mockReset();
    actionDependencies.revoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rotates a valid refresh token and exposes only the new access expiry", async () => {
    actionDependencies.cookieValues.set(REFRESH_COOKIE, "valid-refresh-token");
    actionDependencies.rotate.mockResolvedValue({
      status: "ok",
      accessToken: "new-access-token",
      refreshToken: "rotated-refresh-token",
      refreshExpiresAt: new Date("2026-10-14T12:00:00Z"),
      absoluteExpiresAt: new Date("2027-01-12T12:00:00Z"),
    });

    await expect(ensureSession()).resolves.toEqual({
      ok: true,
      authenticated: true,
      accessExpiresAt: 1_784_206_800_000,
    });
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      "new-access-token",
      expect.objectContaining({ httpOnly: true, maxAge: 3600 }),
    );
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      "rotated-refresh-token",
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("clears cookies and returns refresh_invalid when the refresh cookie is missing", async () => {
    await expect(ensureSession()).resolves.toEqual({
      ok: false,
      code: "refresh_invalid",
      message: "Session refresh is invalid or expired.",
    });
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      LEGACY_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
  });

  it("clears cookies and returns refresh_invalid after a replayed refresh token", async () => {
    actionDependencies.cookieValues.set(REFRESH_COOKIE, "replayed-refresh-token");
    actionDependencies.rotate.mockResolvedValue({ status: "replayed" });

    await expect(ensureSession()).resolves.toEqual({
      ok: false,
      code: "refresh_invalid",
      message: "Session refresh is invalid or expired.",
    });
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
    expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
      LEGACY_COOKIE,
      "",
      expect.objectContaining({ expires: new Date(0) }),
    );
  });

  it("clears every session cookie when logging out", async () => {
    actionDependencies.cookieValues.set(REFRESH_COOKIE, "refresh-to-revoke");

    await expect(logoutCurrentSession()).resolves.toEqual({ ok: true, data: null });

    for (const cookie of [ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE]) {
      expect(actionDependencies.cookieSet).toHaveBeenCalledWith(
        cookie,
        "",
        expect.objectContaining({ expires: new Date(0) }),
      );
    }
  });
});
