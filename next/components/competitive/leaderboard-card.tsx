import type { ReactElement } from "react";
import type { HubStandingRow } from "@/lib/competitive/hub";

type Props = Readonly<{
  top: readonly HubStandingRow[];
  myRow: HubStandingRow | null;
  seasonStatus: string | null | undefined;
}>;

/**
 * Live top 50. No hits column (product rule).
 * If current user is outside top, show ellipsis + their row.
 */
export function LeaderboardCard({
  top,
  myRow,
  seasonStatus,
}: Props): ReactElement {
  const meInTop = top.some((r) => r.isMe);
  const emptyText =
    seasonStatus === "countdown"
      ? "Ожидаем начало сезона..."
      : "Пока никого нет — стань первым!";

  return (
    <article className="c-leaderboard-card c-panel">
      <header className="c-panel-heading">
        <h3>Лидерборд</h3>
        <span>Топ 50 live</span>
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
              {!meInTop && myRow ? (
                <>
                  <tr className="c-row-ellipsis" aria-hidden>
                    <td>…</td>
                    <td>…</td>
                    <td>…</td>
                    <td>…</td>
                  </tr>
                  <tr className="c-row-me" id="currentPlayer">
                    <td>{myRow.place}</td>
                    <td className="c-nick" title={myRow.label}>
                      {myRow.label}
                    </td>
                    <td>{myRow.points}</td>
                    <td>{myRow.daysPlayed}</td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
