"use server";

import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth-server";
import { finalizeCompetitive, getCompetitiveDailyView, recordCompetitiveVote } from "@/lib/competitive/play";
import { getPlayableSeason } from "@/lib/competitive/seasons";
import { getSeasonLeaderboardPage, SeasonLeaderboardPage } from "@/lib/competitive/standings";
import { todayMskDate } from "@/lib/daily-timezone";
import { patchCompetitiveUserPrefs } from "@/lib/competitive/user-prefs";
import { SEASON_LEADERBOARD_PAGE_SIZE } from "@/lib/competitive/constants";

type CompetitiveActionError = "unauthorized" | "invalid_input" | "rate_limited" | "failed";

async function currentPlayer(): Promise<ActionResult<{ id: number }, "unauthorized">> {
  const user = await getCurrentUser();
  return user ? { ok: true, data: { id: user.id } } : { ok: false, code: "unauthorized", message: "Нужно войти, чтобы играть в ranked." };
}

export async function submitCompetitiveVote(input: Readonly<{ roundId: number; chosenScranId: number }>): Promise<ActionResult<Exclude<Awaited<ReturnType<typeof recordCompetitiveVote>>, { ok: false }>, CompetitiveActionError>> {
  const player = await currentPlayer();
  if (!player.ok) return player;
  if (!Number.isInteger(input.roundId) || input.roundId < 1 || !Number.isInteger(input.chosenScranId)) return { ok: false, code: "invalid_input", message: "Некорректный раунд или ответ." };
  if (!(await checkRateLimit(`competitive-vote:${player.data.id}`, 30, 60)).allowed) return { ok: false, code: "rate_limited", message: "Слишком много попыток. Подожди немного." };
  try {
    const result = await recordCompetitiveVote({ userId: player.data.id, date: todayMskDate(), roundId: input.roundId, chosenScranId: input.chosenScranId });
    return result.ok ? { ok: true, data: result } : { ok: false, code: "failed", message: result.error };
  } catch (error) {
    console.error("[competitive-action] vote failed", { userId: player.data.id }, error);
    return { ok: false, code: "failed", message: "Не удалось записать голос." };
  }
}

export async function finalizeCompetitiveDay(): Promise<ActionResult<Exclude<Awaited<ReturnType<typeof finalizeCompetitive>>, { ok: false }>, CompetitiveActionError>> {
  const player = await currentPlayer();
  if (!player.ok) return player;
  if (!(await checkRateLimit(`competitive-finalize:${player.data.id}`, 5, 60)).allowed) return { ok: false, code: "rate_limited", message: "Слишком много попыток. Подожди немного." };
  try {
    const result = await finalizeCompetitive({ userId: player.data.id, date: todayMskDate() });
    return result.ok ? { ok: true, data: result } : { ok: false, code: "failed", message: result.error };
  } catch (error) {
    console.error("[competitive-action] finalize failed", { userId: player.data.id }, error);
    return { ok: false, code: "failed", message: "Не удалось сохранить результат." };
  }
}

export async function getCompetitiveDailyAction(): Promise<ActionResult<Awaited<ReturnType<typeof getCompetitiveDailyView>>, "unauthorized" | "failed">> {
  const player = await currentPlayer();
  if (!player.ok) return player;
  try { return { ok: true, data: await getCompetitiveDailyView(player.data.id) }; }
  catch (error) { console.error("[competitive-action] daily failed", { userId: player.data.id }, error); return { ok: false, code: "failed", message: "Не удалось загрузить дейлик." }; }
}

export async function loadSeasonLeaderboardPage(input: Readonly<{ offset: number; limit: number }>): Promise<ActionResult<SeasonLeaderboardPage, CompetitiveActionError>> {
  const player = await currentPlayer();
  if (!player.ok) return player;
  if (!Number.isInteger(input.offset) || input.offset < 0 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > SEASON_LEADERBOARD_PAGE_SIZE) {
    return { ok: false, code: "invalid_input", message: "Некорректные параметры страницы." };
  }
  if (!(await checkRateLimit(`competitive-leaderboard:${player.data.id}`, 30, 60)).allowed) return { ok: false, code: "rate_limited", message: "Слишком много попыток. Подожди немного." };
  try {
    const season = await getPlayableSeason();
    if (!season) return { ok: false, code: "failed", message: "Нет активного сезона." };
    const data = await getSeasonLeaderboardPage({ seasonId: season.id, userId: player.data.id, offset: input.offset, limit: input.limit });
    return { ok: true, data };
  } catch (error) {
    console.error("[competitive-action] leaderboard page failed", { userId: player.data.id }, error);
    return { ok: false, code: "failed", message: "Не удалось загрузить таблицу лидеров." };
  }
}

export async function updateCompetitivePrefs(input: Readonly<{ introDismissed?: boolean; nickPromptDismissed?: boolean }>): Promise<ActionResult<null, CompetitiveActionError>> {
  const player = await currentPlayer();
  if (!player.ok) return player;
  if ((input.introDismissed !== undefined && typeof input.introDismissed !== "boolean") || (input.nickPromptDismissed !== undefined && typeof input.nickPromptDismissed !== "boolean")) return { ok: false, code: "invalid_input", message: "Некорректные настройки." };
  try { await patchCompetitiveUserPrefs(player.data.id, input); return { ok: true, data: null }; }
  catch (error) { console.error("[competitive-action] prefs failed", { userId: player.data.id }, error); return { ok: false, code: "failed", message: "Не удалось сохранить настройку." }; }
}
