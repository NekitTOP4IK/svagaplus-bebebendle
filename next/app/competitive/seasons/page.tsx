import type { ReactElement } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import {
  listEndedSeasonSummaries,
  safeThemeCardClass,
} from "@/lib/competitive/archive";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";

export const dynamic = "force-dynamic";

function formatDateRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(d);
}

export default async function CompetitiveSeasonsArchivePage(): Promise<ReactElement> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/profile");
  }

  const enabled = await isCompetitiveEnabled();

  if (!enabled) {
    return (
      <CompetitiveShell user={user} season={null} previousEndedSeason={null}>
        <section className="c-disabled-box c-panel">
          <p>Соревновательный режим временно отключён.</p>
          <Link className="pixel-btn px-4 py-2 text-sm font-bold" href="/">
            ← На главную
          </Link>
        </section>
      </CompetitiveShell>
    );
  }

  const seasons = await listEndedSeasonSummaries(user.id);

  return (
    <CompetitiveShell user={user} season={null} previousEndedSeason={null}>
      <section className="c-archive c-panel" aria-labelledby="archive-title">
        <header className="c-panel-heading c-archive-heading">
          <div>
            <h2 id="archive-title">Архив сезонов</h2>
            <p className="c-archive-sub">Завершённые соревновательные сезоны</p>
          </div>
          <Link
            className="pixel-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
            href="/competitive"
          >
            ← К хабу
          </Link>
        </header>

        {seasons.length === 0 ? (
          <p className="c-empty-board">Пока нет завершённых сезонов.</p>
        ) : (
          <ul className="c-season-card-list">
            {seasons.map((s) => {
              const themeClass = safeThemeCardClass(s.themeKey);
              return (
                <li key={s.id}>
                  <Link
                    href={`/competitive/seasons/${s.id}`}
                    className={[
                      "c-season-card",
                      themeClass,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="c-season-card__name">{s.name}</span>
                    <span className="c-season-card__dates">
                      {formatDateRu(s.startsAt)} — {formatDateRu(s.endsAt)}
                    </span>
                    <span className="c-season-card__meta">
                      <span className="c-status c-status--ended">
                        ЗАВЕРШЁН
                      </span>
                      {s.myPlace != null ? (
                        <span className="c-season-card__place">
                          Твоё место: #{s.myPlace}
                        </span>
                      ) : (
                        <span className="c-season-card__place c-season-card__place--muted">
                          Нет результата
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </CompetitiveShell>
  );
}
