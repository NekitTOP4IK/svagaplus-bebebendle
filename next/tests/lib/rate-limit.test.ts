import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  kv: new Map<string, { value: number; ttl: number }>(),
  fail: false,
}));

vi.mock("ioredis", () => {
  return {
    default: class FakeRedis {
      on(): void {}

      private check(): void {
        if (mocks.fail) {
          throw new Error("redis down");
        }
      }

      async set(key: string, value: string, ...args: unknown[]): Promise<string | null> {
        this.check();
        if (mocks.kv.has(key)) {
          return null;
        }
        mocks.kv.set(key, { value: Number(value), ttl: args[1] as number });
        return "OK";
      }

      async incr(key: string): Promise<number> {
        this.check();
        const entry = mocks.kv.get(key);
        if (!entry) {
          mocks.kv.set(key, { value: 1, ttl: -1 });
          return 1;
        }
        entry.value += 1;
        return entry.value;
      }

      async ttl(key: string): Promise<number> {
        this.check();
        return mocks.kv.get(key)?.ttl ?? -2;
      }

      async expire(key: string, ttl: number): Promise<number> {
        this.check();
        const entry = mocks.kv.get(key);
        if (!entry) {
          return 0;
        }
        entry.ttl = ttl;
        return 1;
      }
    },
  };
});

import { checkRateLimit } from "@/app/api/middleware/rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    mocks.kv.clear();
    mocks.fail = false;
  });

  it("allows the first request and sets a TTL atomically", async () => {
    const result = await checkRateLimit("ip:1.2.3.4", 3, 10);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(mocks.kv.get("ratelimit:ip:1.2.3.4")?.ttl).toBe(10);
  });

  it("blocks requests over the limit inside the window", async () => {
    await checkRateLimit("ip:1.2.3.4", 2, 10);
    await checkRateLimit("ip:1.2.3.4", 2, 10);
    const third = await checkRateLimit("ip:1.2.3.4", 2, 10);

    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("repairs a key that lost its TTL instead of blocking forever", async () => {
    mocks.kv.set("ratelimit:ip:1.2.3.4", { value: 5, ttl: -1 });

    const result = await checkRateLimit("ip:1.2.3.4", 2, 10);

    expect(result.allowed).toBe(false);
    expect(mocks.kv.get("ratelimit:ip:1.2.3.4")?.ttl).toBe(10);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it("fails open by default when Redis is down", async () => {
    mocks.fail = true;

    const result = await checkRateLimit("ip:1.2.3.4", 1, 5);

    expect(result.allowed).toBe(true);
  });

  it("fails closed when configured and Redis is down", async () => {
    mocks.fail = true;

    const result = await checkRateLimit("ip:1.2.3.4", 1, 5, "closed");

    expect(result.allowed).toBe(false);
  });
});