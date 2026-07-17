import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { NextResponse } from "next/server";

import { db } from "@/db/schema";

function configOk(): boolean {
  const required = [
    "SESSION_SECRET",
    "BEBEBENDLE_INTERNAL_SECRET",
    "SVAGAPLUS_INTERNAL_URL",
    "SVAGAPLUS_INTERNAL_SECRET",
    "SVAGA_TARGET_USER_ID",
  ] as const;
  return required.every((key) => Boolean(process.env[key]?.trim()));
}

async function databaseOk(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    console.error("[health/ready] database unavailable", error);
    return false;
  }
}

async function redisOk(): Promise<boolean> {
  const client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
        connectTimeout: 2000,
      })
    : new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
        connectTimeout: 2000,
      });

  try {
    if (client.status !== "ready") {
      await client.connect();
    }
    const pong = await client.ping();
    return pong === "PONG";
  } catch (error) {
    console.error("[health/ready] redis unavailable", error);
    return false;
  } finally {
    client.disconnect();
  }
}

export async function GET(): Promise<NextResponse> {
  const [database, redis, configuration] = await Promise.all([
    databaseOk(),
    redisOk(),
    Promise.resolve(configOk()),
  ]);

  const ok = database && redis && configuration;
  return NextResponse.json(
    {
      status: ok ? "ok" : "unavailable",
      components: {
        database: database ? "ok" : "unavailable",
        redis: redis ? "ok" : "unavailable",
        configuration: configuration ? "ok" : "unavailable",
      },
    },
    { status: ok ? 200 : 503 },
  );
}
