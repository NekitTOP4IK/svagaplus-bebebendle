// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubscriberStatus } from "@/lib/svaga";

const mockFetch = vi.fn();

describe("svaga client v1", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    process.env = { ...originalEnv };
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example/";
    process.env.SVAGAPLUS_INTERNAL_SECRET = "sekret123";
    process.env.SVAGA_TARGET_USER_ID = "target-uuid";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns not_configured when required env is missing", async () => {
    delete process.env.SVAGAPLUS_INTERNAL_SECRET;
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts the v1 contract and maps snake_case success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contract_version: 1,
        telegram_user_id: 123,
        target_user_id: "target-uuid",
        is_subscriber: true,
        checked_at: "2026-07-16T12:00:00Z",
      }),
    });

    expect(await getSubscriberStatus(123)).toEqual({
      status: "ok",
      isSubscriber: true,
      checkedAt: new Date("2026-07-16T12:00:00Z"),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://svaga.example/api/internal/bebebendle/subscription-status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Internal-Secret": "sekret123",
        }),
        body: JSON.stringify({
          contract_version: 1,
          telegram_user_id: 123,
        }),
      }),
    );
  });

  it("maps 401 to unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "unauthorized",
    });
  });

  it("maps timeout aborts to timeout", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    mockFetch.mockRejectedValueOnce(err);
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });

  it("maps 500 to upstream", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "upstream",
    });
  });

  it("maps invalid JSON to invalid_response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });

  it("rejects wrong target_user_id as invalid_response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contract_version: 1,
        telegram_user_id: 123,
        target_user_id: "other-target",
        is_subscriber: true,
        checked_at: "2026-07-16T12:00:00Z",
      }),
    });
    expect(await getSubscriberStatus(123)).toEqual({
      status: "unavailable",
      reason: "invalid_response",
    });
  });
});
