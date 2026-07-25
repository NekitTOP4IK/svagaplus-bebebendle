import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionRefreshBoundary } from "@/components/session-refresh-boundary";

const boundaryDependencies = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  getSessionSnapshot: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  ensureSession: boundaryDependencies.ensureSession,
  getSessionSnapshot: boundaryDependencies.getSessionSnapshot,
}), { virtual: true });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: boundaryDependencies.routerRefresh }),
}));

class TestBroadcastChannel {
  readonly postMessage = vi.fn();
  readonly addEventListener = vi.fn();
  readonly removeEventListener = vi.fn();

  constructor(readonly name: string) {}

  close(): void {}
}

async function mountBoundary(): Promise<void> {
  await act(async () => {
    render(<SessionRefreshBoundary />);
  });
}

describe("SessionRefreshBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    window.localStorage.clear();
    boundaryDependencies.ensureSession.mockReset();
    boundaryDependencies.getSessionSnapshot.mockReset();
    boundaryDependencies.routerRefresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not rotate a valid access session on mount", async () => {
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: true,
      accessExpiresAt: Date.now() + 20 * 60 * 1000,
    });

    await mountBoundary();

    expect(boundaryDependencies.getSessionSnapshot).toHaveBeenCalledTimes(1);
    expect(boundaryDependencies.ensureSession).not.toHaveBeenCalled();
  });

  it("rotates exactly once when the access token is within five minutes of expiry", async () => {
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: true,
      accessExpiresAt: Date.now() + 4 * 60 * 1000,
    });
    boundaryDependencies.ensureSession.mockResolvedValue({
      ok: true,
      authenticated: true,
      accessExpiresAt: Date.now() + 60 * 60 * 1000,
    });

    await mountBoundary();

    expect(boundaryDependencies.ensureSession).toHaveBeenCalledTimes(1);
    expect(boundaryDependencies.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("schedules one refresh five minutes before expiry", async () => {
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: true,
      accessExpiresAt: Date.now() + 20 * 60 * 1000,
    });
    boundaryDependencies.ensureSession.mockResolvedValue({
      ok: true,
      authenticated: true,
      accessExpiresAt: Date.now() + 60 * 60 * 1000,
    });

    await mountBoundary();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    });

    expect(boundaryDependencies.ensureSession).toHaveBeenCalledTimes(1);
  });

  it("refreshes the server tree when an expired session becomes signed out", async () => {
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: false,
      accessExpiresAt: null,
    });
    boundaryDependencies.ensureSession.mockResolvedValue({
      ok: false,
      code: "refresh_invalid",
      message: "Session refresh is invalid or expired.",
    });

    await mountBoundary();

    expect(boundaryDependencies.ensureSession).toHaveBeenCalledTimes(1);
    expect(boundaryDependencies.routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("rechecks the session when a hidden tab becomes visible", async () => {
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: true,
      accessExpiresAt: Date.now() + 20 * 60 * 1000,
    });

    await mountBoundary();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(boundaryDependencies.getSessionSnapshot).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(boundaryDependencies.getSessionSnapshot).toHaveBeenCalledTimes(2);
    expect(boundaryDependencies.ensureSession).not.toHaveBeenCalled();
  });

  it("refreshes an expired competitive deep link after session recovery", async () => {
    window.history.replaceState({}, "", "/competitive?next=%2Fcompetitive%2Fplay");
    boundaryDependencies.getSessionSnapshot.mockResolvedValue({
      authenticated: false,
      accessExpiresAt: null,
    });
    boundaryDependencies.ensureSession.mockResolvedValue({
      ok: true,
      authenticated: true,
      accessExpiresAt: Date.now() + 60 * 60 * 1000,
    });

    await mountBoundary();

    expect(boundaryDependencies.routerRefresh).toHaveBeenCalledTimes(1);
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/competitive?next=%2Fcompetitive%2Fplay",
    );
  });
});
