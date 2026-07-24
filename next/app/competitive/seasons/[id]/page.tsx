import type { ReactElement } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth-server";
import { getEndedSeasonDetail } from "@/lib/competitive/archive";
import { isCompetitiveEnabled } from "@/lib/competitive/feature";
import { CompetitiveAuthGate } from "@/components/competitive/competitive-auth-gate";
import { CompetitiveShell } from "@/components/competitive/competitive-shell";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

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

export default async function CompetitiveSeasonDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id: idRaw } = await params;
  const id = Number(idRaw);

  const user = await getCurrentUser();
  if (!user) {
    const next =
      Number.isInteger(id) && id > 0
        ? `/competitive/seasons/${id}`
        : "/competitive/seasons";
    return (
      <Suspense fallback={null}>
        <CompetitiveAuthGate nextPath={next} />
      </Suspense>
    );
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

  if (!Number.isInteger(id) || id < 1) {
    notFound();
  }

  const detail = await getEndedSeasonDetail(id, user.id);
  if (!detail) {
    notFound();
  }

  const { season, ranks, me } = detail;

  return (
    <CompetitiveShell user={user} season={null} previousEndedSeason={null}>
      <section className="c-archive c-panel" aria-labelledby="season-detail-title">
        <header className="c-panel-heading c-archive-heading">
          <div>
            <h2 id="season-detail-title">{season.name}</h2>
            <p className="c-archive-sub">
              {formatDateRu(season.startsAt)} — {formatDateRu(season.endsAt)}
              {" · "}
              <span className="c-status c-status--ended">ЗАВЕРШЁН</span>
            </p>
          </div>
          <nav className="c-archive-nav" aria-label="Навигация архива">
            <Link
              className="pixel-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
              href="/competitive"
            >
              ← К хабу
            </Link>
            <Link
              className="pixel-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
              href="/competitive/seasons"
            >
              Архив сезонов
            </Link>
          </nav>
        </header>

        {me ? (
          <div className="c-archive-me" aria-label="Твой результат">
            <span>
              Твоё место: <b className="c-gold">#{me.place}</b>
            </span>
            <span>
              Очки: <b>{me.points}</b>
            </span>
            <span>
              Дней: <b>{me.daysPlayed}</b>
            </span>
          </div>
        ) : (
          <p className="c-empty-board c-archive-me-empty">
            Ты не участвовал в этом сезоне.
          </p>
        )}

        {ranks.length === 0 ? (
          <p className="c-empty-board">Итоговая таблица пуста.</p>
        ) : (
          <div className="c-table-wrap">
            <table className="c-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ник</th>
                  <th>очки</th>
                  <th>дней</th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((row) => (
                  <tr
                    key={row.userId}
                    className={row.isMe ? "c-row-me" : undefined}
                    id={row.isMe ? "currentPlayer" : undefined}
                  >
                    <td>{row.place}</td>
                    <td className="c-nick" title={row.label}>
                      {row.label}
                    </td>
                    <td>{row.points}</td>
                    <td>{row.daysPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CompetitiveShell>
  );
}
