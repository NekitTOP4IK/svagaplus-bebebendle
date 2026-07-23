import type { ReactElement } from "react";
import type { HubSeasonSummary } from "@/lib/competitive/hub";
import { COMPETITIVE_ICONS } from "@/lib/competitive/icons";
import { CalendarIcon } from "./calendar-icon";
import { HubCountdown } from "./hub-countdown";

type Props = Readonly<{
  season: HubSeasonSummary | null;
  seasonEndsAt: string | null;
  nextDailyAt: string;
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

function statusLabel(status: string | undefined): {
  text: string;
  className: string;
} {
  switch (status) {
    case "active":
      return { text: "АКТИВЕН", className: "c-status" };
    case "countdown":
      return { text: "СКОРО", className: "c-status c-status--countdown" };
    case "ended":
      return { text: "ЗАВЕРШЁН", className: "c-status c-status--ended" };
    default:
      return { text: "НЕТ СЕЗОНА", className: "c-status c-status--none" };
  }
}

export function SeasonHero({
  season,
  seasonEndsAt,
  nextDailyAt,
}: Props): ReactElement {
  const status = statusLabel(season?.status);
  const title = season?.name ?? "Соревновательный режим";

  return (
    <section className="c-season-hero c-panel" aria-labelledby="season-title">
      <div className="c-portal-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/competitive/end-portal.webp" alt="" />
      </div>
      <div className="c-season-main">
        <h2 id="season-title">{title}</h2>
        <span className={status.className}>{status.text}</span>
        {season ? (
          <p className="c-dates">
            <CalendarIcon className="c-dates-cal" />
            <span>
              {formatDateRu(season.startsAt)} — {formatDateRu(season.endsAt)}
            </span>
          </p>
        ) : (
          <p className="c-dates">Сезон пока не объявлен</p>
        )}
      </div>
      <div className="c-season-countdowns">
        <div className="c-count-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="c-pixel-icon c-pixel-icon--lg"
            src={COMPETITIVE_ICONS.clock}
            alt=""
            width={32}
            height={32}
          />
          <span>
            <small>
              {season?.status === "countdown"
                ? "До старта сезона:"
                : season?.status === "ended"
                  ? "Сезон:"
                  : "До конца сезона:"}
            </small>
            <strong>
              {season?.status === "ended" ? (
                "завершён"
              ) : (
                <HubCountdown
                  targetIso={
                    season?.status === "countdown"
                      ? season.startsAt
                      : seasonEndsAt
                  }
                  mode="long"
                  fallback="—"
                />
              )}
            </strong>
          </span>
        </div>
        {/* Daily timer only while season is live */}
        {season?.status === "active" ? (
          <div className="c-count-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="c-pixel-icon c-pixel-icon--lg c-pixel-icon--tint-purple"
              src={COMPETITIVE_ICONS.clock}
              alt=""
              width={32}
              height={32}
            />
            <span>
              <small>До следующего дейлика:</small>
              <strong>
                <HubCountdown
                  targetIso={nextDailyAt}
                  mode="hms"
                  fallback="00:00:00"
                />
              </strong>
            </span>
          </div>
        ) : (
          <div className="c-count-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="c-pixel-icon c-pixel-icon--lg c-pixel-icon--tint-purple"
              src={COMPETITIVE_ICONS.clock}
              alt=""
              width={32}
              height={32}
            />
            <span>
              <small>Дейлик:</small>
              <strong>
                {season?.status === "countdown"
                  ? "после старта сезона"
                  : season?.status === "ended"
                    ? "сезон закрыт"
                    : "нет активного сезона"}
              </strong>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
