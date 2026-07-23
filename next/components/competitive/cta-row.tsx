import type { ReactElement } from "react";
import Link from "next/link";
import type { HubPayload } from "@/lib/competitive/hub";
import { seasonDayNumber } from "@/lib/competitive/hub";
import { COMPETITIVE_ICONS, swordSrcForPlace } from "@/lib/competitive/icons";
import { HubCountdown } from "./hub-countdown";

type Props = Readonly<{
  hub: HubPayload;
}>;

/**
 * Center: play glow / already played / season status.
 * Side slots: place + daily countdown (secondary info, not fake CTAs).
 * Swords on play CTA scale with current rank; pearl = already played.
 */
export function CtaRow({ hub }: Props): ReactElement {
  const placeText =
    hub.me.place != null ? `#${hub.me.place}` : "—";
  const seasonActive = hub.season?.status === "active";

  return (
    <section className="c-cta-strip c-panel" aria-label="Действия режима">
      <div className="c-cta-slot c-cta-slot--info">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="c-pixel-icon c-pixel-icon--sword-slot"
          src={swordSrcForPlace(hub.me.place)}
          alt=""
          width={32}
          height={32}
        />
        <span>
          <small>Твоё место</small>
          <b className="c-gold">{placeText}</b>
        </span>
      </div>

      {renderCenter(hub)}

      <div className="c-cta-slot c-cta-slot--info">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="c-pixel-icon c-pixel-icon--lg"
          src={COMPETITIVE_ICONS.clock}
          alt=""
          width={32}
          height={32}
        />
        <span>
          <small>{seasonActive ? "До дейлика" : "Дейлик"}</small>
          <b>
            {seasonActive ? (
              <HubCountdown
                targetIso={hub.countdowns.nextDailyAt}
                mode="hms"
                fallback="00:00:00"
              />
            ) : hub.season?.status === "countdown" ? (
              "после старта"
            ) : hub.season?.status === "ended" ? (
              "сезон закрыт"
            ) : (
              "—"
            )}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="c-pixel-icon c-pixel-icon--pearl"
          src={COMPETITIVE_ICONS.pearl}
          alt=""
          width={32}
          height={32}
        />
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

  const swordSrc = swordSrcForPlace(hub.me.place);
  const dayN = seasonDayNumber(season.startsAt);
  const playLabel = `Играть: День ${dayN}`;

  return (
    <Link
      href="/competitive/play"
      className="pixel-btn pixel-btn-info c-cta-center c-cta-center--play inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold sm:text-base"
      aria-label={playLabel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="c-pixel-icon c-pixel-icon--sword"
        src={swordSrc}
        alt=""
        width={32}
        height={32}
        decoding="async"
      />
      {playLabel}
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
