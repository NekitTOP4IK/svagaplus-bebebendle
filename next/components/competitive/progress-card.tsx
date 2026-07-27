import type { ReactElement } from "react";
import type { HubMe } from "@/lib/competitive/hub";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone, type UserRole } from "@/lib/user-identity";
import { IceCubeRow, StreakFire, type FreezeVisual } from "./streak-fire";

type Props = Readonly<{
  me: HubMe;
  photoUrl: string | null;
  /** Role and SVAGA+ state drive the same nick tone, ring and badge the topbar chip uses. */
  role: UserRole | string | null;
  isSubscriber: boolean | null;
  /** Show freeze charge row (only when a season is visible). */
  showFreeze?: boolean;
}>;

function freezeVisual(
  showFreeze: boolean,
  me: HubMe,
): FreezeVisual {
  if (!showFreeze) return "hidden";
  if (me.streakFreezeHolding) return "holding";
  if (me.streakFreezeAvailable) return "ready";
  return "used";
}

export function ProgressCard({
  me,
  photoUrl,
  role,
  isSubscriber,
  showFreeze = false,
}: Props): ReactElement {
  const placeText = me.place != null ? `#${me.place}` : "—";
  const initials = me.label.slice(0, 2).toUpperCase() || "?";
  const freeze = freezeVisual(showFreeze, me);
  const tone = resolveIdentityTone(role, isSubscriber);

  return (
    <article className="c-progress-card c-panel" id="profile">
      <h3>Твой прогресс</h3>
      <div className="c-player-line">
        <span
          className={`c-player-avatar ${
            tone === "default" ? "c-player-avatar--plain" : `user-avatar--${tone}`
          }`}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="c-avatar-fallback">{initials}</span>
          )}
        </span>
        <UserIdentity
          name={me.label}
          role={role}
          isSubscriber={isSubscriber}
          size="sm"
          className="min-w-0 flex-1"
          nickGlow
          pixelFont
        />
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
      {freeze !== "hidden" ? (
        <>
          <div className="c-divider" />
          <IceCubeRow state={freeze} />
        </>
      ) : null}
    </article>
  );
}
