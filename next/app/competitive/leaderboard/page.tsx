import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth-server";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { ensureSeasonTransitions, getPlayableSeason } from "@/lib/competitive/seasons";
import { getSeasonLeaderboardPage } from "@/lib/competitive/standings";
import { CompetitiveAuthGate } from "@/components/competitive/competitive-auth-gate";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";
import { SeasonLeaderboardList } from "@/components/competitive/season-leaderboard-list";
import { SEASON_LEADERBOARD_PAGE_SIZE } from "@/lib/competitive/constants";

export const dynamic = "force-dynamic";

export default async function CompetitiveLeaderboardPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Suspense fallback={null}>
        <CompetitiveAuthGate nextPath="/competitive/leaderboard" />
      </Suspense>
    );
  }

  const enabled = await isCompetitiveEnabled();
  if (!enabled) {
    return (
      <CompetitiveShell user={user} season={null}>
        <section className="c-disabled-box c-panel">
          <p>Соревновательный режим временно отключён.</p>
          <Link className="pixel-btn px-4 py-2 text-sm font-bold" href="/">
            ← На главную
          </Link>
        </section>
      </CompetitiveShell>
    );
  }

  await ensureSeasonTransitions();
  const season = await getPlayableSeason();
  if (!season) {
    redirect("/competitive/seasons");
  }

  const firstPage = await getSeasonLeaderboardPage({
    seasonId: season.id,
    userId: user.id,
    offset: 0,
    limit: SEASON_LEADERBOARD_PAGE_SIZE,
  });

  return (
    <CompetitiveShell user={user} season={null}>
      <section
        className="c-archive c-panel"
        aria-labelledby="full-leaderboard-title"
      >
        <header className="c-panel-heading c-archive-heading">
          <div>
            <h2 id="full-leaderboard-title">Таблица лидеров сезона</h2>
          </div>
          <nav className="c-archive-nav" aria-label="Навигация">
            <Link
              className="pixel-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
              href="/competitive"
            >
              ← К хабу
            </Link>
          </nav>
        </header>

        {firstPage.total === 0 ? (
          <p className="c-empty-board">Пока никого нет — стань первым!</p>
        ) : (
          <SeasonLeaderboardList initialPage={firstPage} />
        )}
      </section>
    </CompetitiveShell>
  );
}
