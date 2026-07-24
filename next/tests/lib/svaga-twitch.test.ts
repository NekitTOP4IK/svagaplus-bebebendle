// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTwitchIdentity } from "@/lib/svaga-twitch";

const mockFetch = vi.fn();

describe("getTwitchIdentity", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    process.env = { ...originalEnv };
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example/";
    process.env.SVAGAPLUS_INTERNAL_SECRET = "sekret123";
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns not_configured when env is missing", async () => {
    delete process.env.SVAGAPLUS_INTERNAL_SECRET;
    expect(await getTwitchIdentity("123")).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps linked success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contract_version: 1,
        linked: true,
        twitch_id: "99",
        twitch_username: "viewer",
        avatar_url: "https://img.example/a.png",
        telegram_user_id: 42,
      }),
    });

    expect(await getTwitchIdentity("99")).toEqual({
      status: "ok",
      linked: true,
      telegramUserId: 42,
      twitchId: "99",
      twitchUsername: "viewer",
      avatarUrl: "https://img.example/a.png",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://svaga.example/api/internal/bebebendle/twitch-identity",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Internal-Secret": "sekret123",
        }),
        body: JSON.stringify({
          contract_version: 1,
          twitch_id: "99",
        }),
      }),
    );
  });

  it("maps unlinked success without username", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        contract_version: 1,
        linked: false,
        twitch_id: "99",
      }),
    });

    expect(await getTwitchIdentity("99")).toEqual({
      status: "ok",
      linked: false,
      twitchId: "99",
      twitchUsername: null,
      avatarUrl: null,
    });
  });

  it("maps 401 to unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    expect(await getTwitchIdentity("1")).toEqual({
      status: "unavailable",
      reason: "unauthorized",
    });
  });

  it("maps timeout to timeout", async () => {
    const err = new Error("aborted");
    err.name = "TimeoutError";
    mockFetch.mockRejectedValueOnce(err);
    expect(await getTwitchIdentity("1")).toEqual({
      status: "unavailable",
      reason: "timeout",
    });
  });
});
