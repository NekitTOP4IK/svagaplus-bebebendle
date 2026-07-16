import { cookies } from "next/headers";
import { DailyGameClient } from "@/components/daily/daily-game-client";
import { AlreadyPlayedServer } from "@/components/daily/already-played-server";
import { DailyUnavailable } from "@/components/daily/daily-unavailable";
import { getDailyData } from "./lib/get-daily-data";
import { hasPlayedTodayServer } from "./lib/cookies-server";

export default async function DailyPage() {
  const cookieStore = await cookies();

  // Check if user already played today (server-side)
  const hasPlayed = hasPlayedTodayServer(cookieStore);

  if (hasPlayed) {
    const result = cookieStore.get("daily_result")?.value;
    if (result) {
      return <AlreadyPlayedServer result={result} />;
    }
  }

  const data = await getDailyData();

  if (!data) {
    return <DailyUnavailable />;
  }

  return <DailyGameClient initialData={data} />;
}
