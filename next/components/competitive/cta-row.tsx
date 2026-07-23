import type { ReactElement } from "react";
import Link from "next/link";
import type { HubPayload } from "@/lib/competitive/hub";
import { HubCountdown } from "./hub-countdown";

type Props = Readonly<{
  hub: HubPayload;
}>;

/**
 * Center: play glow / already played / season status.
 * Side slots: place + daily countdown (secondary info, not fake CTAs).
 */
export function CtaRow({ hub }: Props): ReactElement {
  const placeText =
    hub.me.place != null ? `#${hub.me.place}` : "—";

  return (
    <section className="c-cta-strip c-panel" aria-label="Действия режима">
      <div className="c-cta-slot c-cta-slot--info">
        <span className="c-end-gem" aria-hidden>
          ✦
        </span>
        <span>
          <small>Твоё место</small>
          <b className="c-gold">{placeText}</b>
        </span>
      </div>

      {renderCenter(hub)}

      <div className="c-cta-slot c-cta-slot--info">
        <span className="c-count-icon c-count-icon--purple" aria-hidden>
          ◷
        </span>
        <span>
          <small>До дейлика</small>
          <b>
            <HubCountdown
              targetIso={hub.countdowns.nextDailyAt}
              mode="hms"
              fallback="00:00:00"
            />
          </b>
        </span>
      </div>
    </section>
  );
}

function renderCenter(hub: HubPayload): ReactElement {
  const season = hub.season;

  if (!season) {
    return (
      <div className="c-cta-center c-cta-center--neutral" role="status">
        <b>Сезон не объявлен</b>
      </div>
    );
  }

  if (season.status === "countdown") {
    return (
      <div className="c-cta-center c-cta-center--neutral" role="status">
        <span>
          <small style={{ display: "block", marginBottom: 6, font: "9px var(--c-pixel)" }}>
            Сезон начнётся
          </small>
          <b>
            <HubCountdown
              targetIso={season.startsAt}
              mode="long"
              fallback="скоро"
            />
          </b>
        </span>
      </div>
    );
  }

  if (season.status === "ended") {
    const place =
      hub.me.place != null ? ` · место #${hub.me.place}` : "";
    return (
      <div className="c-cta-center c-cta-center--neutral" role="status">
        <b>
          Сезон завершён{place}
          {hub.me.points > 0 ? ` · ${hub.me.points} очков` : ""}
        </b>
      </div>
    );
  }

  // active
  if (hub.hasPlayed) {
    const pts = hub.todayPoints ?? 0;
    return (
      <div className="c-cta-center c-cta-center--played" role="status">
        <span className="c-pearl" aria-hidden>
          ◉
        </span>
        <b>
          Уже сыграно · <em>{pts}</em>{" "}
          {pointsWord(pts)}
        </b>
      </div>
    );
  }

  if (!hub.hasDailyToday) {
    return (
      <div className="c-cta-center c-cta-center--neutral" role="status">
        <b>Дейлик ещё не готов</b>
      </div>
    );
  }

  return (
    <Link
      href="/competitive/play"
      className="c-cta-center c-cta-center--play"
      aria-label="Играть сегодня"
    >
      <span className="c-cta-icon c-cta-icon--sword" aria-hidden>
        ⚔
      </span>
      <b>Играть сегодня</b>
    </Link>
  );
}

function pointsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "очко";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "очка";
  return "очков";
}
