import type { ReactElement } from "react";
import Link from "next/link";
import type { HubStandingRow } from "@/lib/competitive/hub";
import { isSeasonPlayableNow } from "@/lib/competitive/seasons";

type Props = Readonly<{
  top: readonly HubStandingRow[];
  myWindow: readonly HubStandingRow[];
  seasonStatus: string | null | undefined;
  seasonStartsAt: string | null | undefined;
  seasonEndsAt: string | null | undefined;
}>;

/**
 * Live top 50. No hits column (product rule).
 * If current user is outside top, show their neighbouring places below,
 * with an ellipsis separator only when there is an actual gap.
 */
export function LeaderboardCard({
  top,
  myWindow,
  seasonStatus,
  seasonStartsAt,
  seasonEndsAt,
}: Props): ReactElement {
  const lastTopPlace = top[top.length - 1]?.place ?? 0;
  const showEllipsis =
    myWindow.length > 0 && myWindow[0]!.place > lastTopPlace + 1;
  const emptyText =
    seasonStatus === "countdown"
      ? "Ожидаем начало сезона..."
      : "Пока никого нет — стань первым!";
  // /competitive/leaderboard redirects unless getPlayableSeason finds the
  // season inside its startsAt/endsAt window — an admin can set status
  // "active" ahead of that window, so status alone is not enough here.
  const canOpenFullList =
    seasonStartsAt != null &&
    seasonEndsAt != null &&
    isSeasonPlayableNow({
      status: seasonStatus ?? "",
      startsAt: seasonStartsAt,
      endsAt: seasonEndsAt,
    });

  return (
    <article className="c-leaderboard-card c-panel">
      <header className="c-panel-heading">
        <h3>Таблица лидеров</h3>
        {canOpenFullList ? (
          <Link
            className="pixel-btn c-leaderboard-more-btn px-3 py-1.5 text-xs font-bold"
            href="/competitive/leaderboard"
          >
            Весь список
          </Link>
        ) : null}
      </header>
      {top.length === 0 ? (
        <p className="c-empty-board">{emptyText}</p>
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
              {top.map((row) => (
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
              {myWindow.length > 0 ? (
                <>
                  {showEllipsis ? (
                    <tr className="c-row-ellipsis" aria-hidden>
                      <td>…</td>
                      <td>…</td>
                      <td>…</td>
                      <td>…</td>
                    </tr>
                  ) : null}
                  {myWindow.map((row) => (
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
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
