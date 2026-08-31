import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: 1,
  lazyConnect: true,
  retryStrategy: () => null,
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: number = 1,
  windowSeconds: number = 5,
  onRedisError: "open" | "closed" = "open",
): Promise<RateLimitResult> {
  const key = `ratelimit:${identifier}`;

  try {
    // Atomic creation: TTL is set in the same command as the key, so a crash
    // between INCR and EXPIRE can no longer leave a key without a TTL.
    const created = await redis.set(key, "1", "EX", windowSeconds, "NX");
    const current = created === "OK" ? 1 : await redis.incr(key);
    let ttl = await redis.ttl(key);
    if (ttl < 0) {
      // Repair keys that predate the atomic creation (no TTL → permanent 429).
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }

    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetAt: Date.now() + ttl * 1000,
    };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    if (onRedisError === "closed") {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + windowSeconds * 1000,
      };
    }
    return {
      allowed: true,
      remaining: limit,
      resetAt: Date.now() + windowSeconds * 1000,
    };
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}
