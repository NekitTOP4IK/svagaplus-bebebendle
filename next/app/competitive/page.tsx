import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { getHubPayload } from "@/lib/competitive/hub";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";
import { SeasonHero } from "@/components/competitive/season-hero";
import { CtaRow } from "@/components/competitive/cta-row";
import { ProgressCard } from "@/components/competitive/progress-card";
import { LeaderboardCard } from "@/components/competitive/leaderboard-card";
import { RulesCard } from "@/components/competitive/rules-card";
import { RewardsCard } from "@/components/competitive/rewards-card";

export const dynamic = "force-dynamic";

export default async function CompetitiveHubPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/profile");
  }

  const hub = await getHubPayload(user.id);

  if (!hub.enabled) {
    return (
      <CompetitiveShell user={user} season={null}>
        <section className="c-disabled-box c-panel">
          <p>Соревновательный режим временно отключён.</p>
          <Link className="c-pixel-btn" href="/">
            ← На главную
          </Link>
        </section>
      </CompetitiveShell>
    );
  }

  return (
    <CompetitiveShell
      user={user}
      season={hub.season}
      nextDailyAt={hub.countdowns.nextDailyAt}
    >
      <SeasonHero
        season={hub.season}
        seasonEndsAt={hub.countdowns.seasonEndsAt}
        nextDailyAt={hub.countdowns.nextDailyAt}
      />

      <CtaRow hub={hub} />

      <section className="c-dashboard">
        <ProgressCard me={hub.me} photoUrl={user.telegramPhotoUrl} />
        <LeaderboardCard top={hub.top} myRow={hub.myRow} />
        <aside className="c-right-column">
          <RulesCard />
          <RewardsCard />
        </aside>
      </section>
    </CompetitiveShell>
  );
}
