// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns a 200 response unchanged without refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/user/profile");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a single successful refresh on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("refreshed", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/user/profile");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
  });

  it("shares one refresh request across simultaneous 401s", async () => {
    let resolveRefresh: ((value: Response) => void) | null = null;
    const refreshPromise = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    let call = 0;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      call += 1;
      const url = String(input);
      if (url.includes("/api/auth/refresh")) {
        return refreshPromise;
      }
      if (call <= 5) {
        return Promise.resolve(new Response("unauthorized", { status: 401 }));
      }
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = Promise.all([
      apiFetch("/api/a"),
      apiFetch("/api/b"),
      apiFetch("/api/c"),
      apiFetch("/api/d"),
      apiFetch("/api/e"),
    ]);

    await Promise.resolve();
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);

    resolveRefresh?.(new Response("refreshed", { status: 200 }));
    const responses = await pending;
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toHaveLength(1);
  });

  it("returns the original 401 when refresh fails without looping", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiFetch("/api/user/profile");
    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
  });
});
