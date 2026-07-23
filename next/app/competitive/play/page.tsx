import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, competitiveDailies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { hasPlayed } from "@/lib/competitive/play";
import { todayMskDate } from "@/lib/daily-timezone";
import { CompetitiveGameClient } from "@/components/competitive/competitive-game-client";

export const dynamic = "force-dynamic";

export default async function CompetitivePlayPage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/profile");
  }

  if (!(await isCompetitiveEnabled())) {
    return (
      <UnavailablePanel
        title="Соревновательный режим отключён"
        body="Режим временно недоступен. Загляни позже."
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
            className="inline-block border-4 border-black bg-yellow-400 px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-yellow-300"
          >
            В хаб
          </Link>
          <Link
            href="/"
            className="inline-block border-4 border-black bg-white px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-zinc-100"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
