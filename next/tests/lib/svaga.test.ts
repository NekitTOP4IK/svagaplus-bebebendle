import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getSubscriberStatus } from "@/lib/svaga";

// Helper to mock fetch
const mockFetch = vi.fn();

describe("svaga client", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - override global fetch for tests
    global.fetch = mockFetch;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns {isSubscriber: false} and warns when SVAGAPLUS_INTERNAL_URL missing", async () => {
    delete process.env.SVAGAPLUS_INTERNAL_URL;
    process.env.INTERNAL_SECRET = "sekret";

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await getSubscriberStatus(123456789);
    expect(res).toEqual({ isSubscriber: false });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("SVAGA+ internal config missing")
    );
  });

  it("returns {isSubscriber: false} and warns when INTERNAL_SECRET missing", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example";
    delete process.env.INTERNAL_SECRET;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await getSubscriberStatus(123);
    expect(res).toEqual({ isSubscriber: false });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns subscriber true when svagaplus responds with is_subscriber true (snake_case)", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example/";
    process.env.INTERNAL_SECRET = "sekret123";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ is_subscriber: true, tribute_user_id: "trib-42" }),
    });

    const res = await getSubscriberStatus(987654321);
    expect(res).toEqual({ isSubscriber: true, tributeUserId: "trib-42" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://svaga.example/internal/bebebendle/get-status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Internal-Secret": "sekret123",
        }),
        body: JSON.stringify({ telegram_user_id: 987654321 }),
      })
    );
  });

  it("returns subscriber false and maps camelCase response from svagaplus", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example";
    process.env.INTERNAL_SECRET = "sekret123";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isSubscriber: false, tributeUserId: undefined }),
    });

    const res = await getSubscriberStatus(111);
    expect(res).toEqual({ isSubscriber: false, tributeUserId: undefined });
  });

  it("returns isSubscriber false on non-ok http response", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example";
    process.env.INTERNAL_SECRET = "sekret123";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    const res = await getSubscriberStatus(222);
    expect(res).toEqual({ isSubscriber: false });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("subscriber check failed"),
      503
    );
  });

  it("returns isSubscriber false and logs on network error / timeout", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example";
    process.env.INTERNAL_SECRET = "sekret123";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockFetch.mockRejectedValueOnce(new Error("fetch failed or timeout"));

    const res = await getSubscriberStatus(333);
    expect(res).toEqual({ isSubscriber: false });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("logs start and result using [svaga] prefix", async () => {
    process.env.SVAGAPLUS_INTERNAL_URL = "https://svaga.example";
    process.env.INTERNAL_SECRET = "sekret123";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ is_subscriber: true }),
    });

    await getSubscriberStatus(444);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[svaga] subscriber check start for telegramUserId=444")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[svaga] subscriber check result for 444: isSubscriber=true")
    );
  });
});
