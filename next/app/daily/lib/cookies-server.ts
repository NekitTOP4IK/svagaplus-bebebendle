import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { todayMskDate } from "@/lib/daily-timezone";

const DAILY_RESULT_COOKIE = "daily_result";

export function hasPlayedTodayServer(cookieStore: ReadonlyRequestCookies): boolean {
  const resultCookie = cookieStore.get(DAILY_RESULT_COOKIE);

  if (!resultCookie) {
    return false;
  }

  try {
    const result = JSON.parse(resultCookie.value);
    return result.date === todayMskDate();
  } catch {
    return false;
  }
}
