"use client";

import { nextMidnightMsk, todayMskDate } from "@/lib/daily-timezone";

const COOKIE_NAME = "daily_bebendle";

type DailyResult = {
  date: string;
  score: number;
  totalRounds: number;
  userAnswers: Array<{
    roundNumber: number;
    isCorrect: boolean;
    chosenScranId: number;
    correctScranId: number;
    percentageA: number;
    percentageB: number;
  }>;
};

export function hasPlayedToday(): boolean {
  if (typeof document === "undefined") return false;

  const result = getTodayResult();
  if (!result) return false;

  return result.date === todayMskDate();
}

export function saveDailyResult(result: DailyResult): void {
  if (typeof document === "undefined") return;

  // Cookie expires at next 00:00 MSK (daily reset)
  const expires = nextMidnightMsk().toUTCString();
  const cookieValue = encodeURIComponent(JSON.stringify(result));
  document.cookie = `${COOKIE_NAME}=${cookieValue}; expires=${expires}; path=/; SameSite=Strict`;
}

export function getTodayResult(): DailyResult | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  const cookie = cookies.find((c) => c.trim().startsWith(`${COOKIE_NAME}=`));

  if (!cookie) return null;

  try {
    const value = cookie.split("=")[1];
    const result = JSON.parse(decodeURIComponent(value)) as DailyResult;

    if (result.date !== todayMskDate()) return null;

    return result;
  } catch {
    return null;
  }
}
