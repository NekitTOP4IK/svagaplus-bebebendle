import type { ReactElement } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { getHubPayload } from "@/lib/competitive/hub";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";
import { CompetitiveAuthGate } from "@/components/competitive/competitive-auth-gate";
import { SeasonHero } from "@/components/competitive/season-hero";
import { CtaRow } from "@/components/competitive/cta-row";
import { ProgressCard } from "@/components/competitive/progress-card";
import { LeaderboardCard } from "@/components/competitive/leaderboard-card";
import { RulesCard } from "@/components/competitive/rules-card";
import { RewardsCard } from "@/components/competitive/rewards-card";
import { CompetitiveOnboarding } from "@/components/competitive/competitive-onboarding";
import { sanitizeNextPath } from "@/lib/safe-next-path";

export const dynamic = "force-dynamic";

export default async function CompetitiveHubPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ next?: string }>;
}>): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="c-hub min-h-dvh flex items-center justify-center text-white">
            Загрузка…
          </div>
        }
      >
        <CompetitiveAuthGate nextPath="/competitive" />
      </Suspense>
    );
  }

  const nextPath = sanitizeNextPath((await searchParams).next, "/competitive");
  if (nextPath !== "/competitive") redirect(nextPath);

  const hub = await getHubPayload(user.id);

  if (!hub.enabled) {
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

  return (
    <CompetitiveShell
      user={user}
      season={hub.season}
      nextDailyAt={hub.countdowns.nextDailyAt}
    >
      <CompetitiveOnboarding
        competitiveDisplayName={user.competitiveDisplayName}
        onboarding={hub.onboarding}
      />
      <SeasonHero
        season={hub.season}
        seasonEndsAt={hub.countdowns.seasonEndsAt}
        nextDailyAt={hub.countdowns.nextDailyAt}
      />

      <CtaRow hub={hub} />

      <section className="c-dashboard">
        <ProgressCard
          me={hub.me}
          photoUrl={user.telegramPhotoUrl}
          role={user.role}
          isSubscriber={user.isSubscriber}
          showFreeze={hub.season != null}
        />
        <LeaderboardCard
          top={hub.top}
          myWindow={hub.myWindow}
          seasonStatus={hub.season?.status}
          seasonStartsAt={hub.season?.startsAt}
          seasonEndsAt={hub.season?.endsAt}
        />
        <aside className="c-right-column">
          <RulesCard
            modeRules={hub.modeRules}
            seasonRules={hub.seasonRules}
          />
          <RewardsCard rewards={hub.seasonRewards} />
        </aside>
      </section>
    </CompetitiveShell>
  );
}
