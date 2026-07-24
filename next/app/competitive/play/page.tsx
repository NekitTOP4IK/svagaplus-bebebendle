import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, competitiveDailies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { hasPlayed } from "@/lib/competitive/play";
import {
  ensureSeasonTransitions,
  getPlayableSeason,
} from "@/lib/competitive/seasons";
import { todayMskDate } from "@/lib/daily-timezone";
import { CompetitiveGameClient } from "@/components/competitive/competitive-game-client";

export const dynamic = "force-dynamic";

export default async function CompetitivePlayPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    // Auth gate on hub; after login go straight to play.
    redirect("/competitive?next=%2Fcompetitive%2Fplay");
  }

  if (!(await isCompetitiveEnabled())) {
    return (
      <UnavailablePanel
        title="Соревновательный режим отключён"
        body="Режим временно недоступен. Загляни позже."
      />
    );
  }

  await ensureSeasonTransitions();

  const playableSeason = await getPlayableSeason();
  if (!playableSeason) {
    return (
      <UnavailablePanel
        title="Сезон недоступен"
        body="Сейчас нет активного соревновательного сезона. Вернись в хаб."
      />
    );
  }

  const today = todayMskDate();

  if (await hasPlayed(user.id, today)) {
    redirect("/competitive");
  }

  const [daily] = await db
    .select({ id: competitiveDailies.id })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.date, today))
    .limit(1);

  if (!daily) {
    return (
      <UnavailablePanel
        title="Дейлик ещё не готов"
        body="Соревновательный набор на сегодня ещё не сгенерирован. Вернись в хаб или загляни позже."
      />
    );
  }

  return <CompetitiveGameClient />;
}

function UnavailablePanel({
  title,
  body,
}: Readonly<{
  title: string;
  body: string;
}>): ReactElement {
  return (
    <div className="retro-bg flex min-h-dvh items-center justify-center px-4">
      <div className="retro-overlay absolute inset-0" />
      <div className="relative z-10 w-full max-w-md border-4 border-black bg-white p-8 text-center text-black shadow-[6px_6px_0_#000]">
        <h1 className="pixel-text-on-light mb-4 text-2xl font-bold">{title}</h1>
        <p className="mb-8 text-base text-zinc-800">{body}</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/competitive"
            className="pixel-btn pixel-btn-ok px-6 py-3 text-sm font-bold"
          >
            В хаб
          </Link>
          <Link href="/" className="pixel-btn px-6 py-3 text-sm font-bold">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
