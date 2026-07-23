import type { ReactElement } from "react";
import type { HubMe } from "@/lib/competitive/hub";
import { StreakFire } from "./streak-fire";

type Props = Readonly<{
  me: HubMe;
  photoUrl: string | null;
}>;

export function ProgressCard({ me, photoUrl }: Props): ReactElement {
  const placeText = me.place != null ? `#${me.place}` : "—";
  const initials = me.label.slice(0, 2).toUpperCase() || "?";

  return (
    <article className="c-progress-card c-panel" id="profile">
      <h3>Твой прогресс</h3>
      <div className="c-player-line">
        <span className="c-player-avatar">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" />
          ) : (
            <span className="c-avatar-fallback">{initials}</span>
          )}
        </span>
        <strong title={me.label}>{me.label}</strong>
      </div>
      <dl className="c-stats-list">
        <div>
          <dt>Место:</dt>
          <dd className="c-gold">{placeText}</dd>
        </div>
        <div>
          <dt>Очки сезона:</dt>
          <dd>{me.points}</dd>
        </div>
        <div>
          <dt>Дней:</dt>
          <dd>{me.daysPlayed}</dd>
        </div>
      </dl>
      <div className="c-divider" />
      <div className="c-streak-block">
        <p className="c-streak-title">Стрик</p>
        <StreakFire days={me.streakDays} />
      </div>
    </article>
  );
}
