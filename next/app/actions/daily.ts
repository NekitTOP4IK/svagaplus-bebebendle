"use server";

import { headers } from "next/headers";
import { db, dailyUserResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import {
  computeAndStoreDailyResult,
  recordDailyVote,
  resolvePlaySessionId,
} from "@/lib/daily-integrity";
import { todayMskDate } from "@/lib/daily-timezone";

async function getClientIpFromHeaders(): Promise<string> {
  const headersList = await headers();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = headersList.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

/**
 * Vote for a daily round. Pair is loaded from daily_scrandles — client A/B ids ignored.
 * Persists choice for server-side score.
 */
export async function submitDailyVote(
  input: Readonly<{ roundNumber: number; chosenScranId: number; fingerprint: string | null; date?: string }>,
) {
  const clientIp = await getClientIpFromHeaders();

  const rateLimitResult = await checkRateLimit(
    `daily-vote:${clientIp}`,
    2,
    5,
  );

  if (!rateLimitResult.allowed) {
    return { error: "Too many requests. Please wait.", status: 429 };
  }

  const playDate =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayMskDate();

  const sessionId = resolvePlaySessionId(input.fingerprint, clientIp);

  const result = await recordDailyVote({
    date: playDate,
    roundNumber: input.roundNumber,
    chosenScranId: input.chosenScranId,
    sessionId,
    fingerprint: input.fingerprint,
  });

  if ("error" in result) {
    return { error: result.error, status: result.status };
  }

  return {
    success: true as const,
    roundNumber: result.roundNumber,
    isCorrect: result.isCorrect,
    chosenScranId: result.chosenScranId,
    correctScranId: result.correctScranId,
    percentageA: result.percentageA,
    percentageB: result.percentageB,
    fingerprint: input.fingerprint,
  };
}

/**
 * Finalize daily. Score is computed only from stored round votes — client score ignored.
 */
export async function submitDailyResult(
  input: Readonly<{ date: string; fingerprint: string | null }>,
) {
  const clientIp = await getClientIpFromHeaders();

  const rateLimitResult = await checkRateLimit(
    `daily-result:${clientIp}`,
    1,
    10,
  );

  if (!rateLimitResult.allowed) {
    return { error: "Too many requests. Please wait.", status: 429 };
  }

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "Invalid date", status: 400 };
  }

  const sessionId = resolvePlaySessionId(input.fingerprint, clientIp);
  const result = await computeAndStoreDailyResult({
    date: input.date,
    sessionId,
    fingerprint: input.fingerprint,
  });

  if ("error" in result) {
    return { error: result.error, status: result.status };
  }

  return {
    success: true as const,
    score: result.score,
    alreadyPlayed: result.alreadyPlayed ?? false,
    fingerprint: input.fingerprint,
  };
}

export async function getDailyAverage(date: string) {
  const results = await db
    .select({
      score: dailyUserResults.score,
    })
    .from(dailyUserResults)
    .where(eq(dailyUserResults.date, date));

  if (results.length === 0) {
    return {
      date,
      totalUsers: 0,
      averageScore: null,
      scoreDistribution: [] as { score: number; count: number }[],
    };
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const averageScore = Math.round((totalScore / results.length) * 10) / 10;

  const distributionMap = new Map<number, number>();
  for (let i = 0; i <= 10; i++) {
    distributionMap.set(i, 0);
  }
  results.forEach((r) => {
    distributionMap.set(r.score, (distributionMap.get(r.score) || 0) + 1);
  });

  const scoreDistribution = Array.from(distributionMap.entries()).map(
    ([score, count]) => ({ score, count }),
  );

  return {
    date,
    totalUsers: results.length,
    averageScore,
    scoreDistribution,
  };
}
