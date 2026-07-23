import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/auth-server";
import type { HubSeasonSummary } from "@/lib/competitive/hub";
import { COMPETITIVE_ICONS } from "@/lib/competitive/icons";
import { CompetitiveLogout } from "./competitive-logout";
import { HubCountdown } from "./hub-countdown";
import "./competitive.css";

type Props = Readonly<{
  user: CurrentUser;
  season: HubSeasonSummary | null;
  nextDailyAt?: string | null;
  children: ReactNode;
}>;

function seasonMiniStatus(season: HubSeasonSummary | null): {
  label: string;
  className: string;
  name: string;
} {
  if (!season) {
    return {
      label: "Нет сезона",
      className: "c-muted-status",
      name: "—",
    };
  }
  switch (season.status) {
    case "active":
      return {
        label: "Сезон активен",
        className: "",
        name: season.name,
      };
    case "countdown":
      return {
        label: "Скоро старт",
        className: "c-countdown-status",
        name: season.name,
      };
    case "ended":
      return {
        label: "Сезон завершён",
        className: "c-ended-status",
        name: season.name,
      };
    default:
      return {
        label: season.status,
        className: "c-muted-status",
        name: season.name,
      };
  }
}

/**
 * End-themed competitive shell: atmosphere, topbar, footer.
 * Product: no login CTA on hub; auth is gated by the page.
 */
export function CompetitiveShell({
  user,
  season,
  nextDailyAt,
  children,
}: Props): ReactElement {
  const nick =
    user.displayName ||
    user.telegramUsername ||
    `tg:${user.telegramId}`;
  const initials = nick.slice(0, 2).toUpperCase();
  const mini = seasonMiniStatus(season);

  return (
    <div className="c-hub">
      <div className="c-world-bg" aria-hidden />
      <div className="c-vignette" aria-hidden />
      <div className="c-particles" aria-hidden />

      <main className="c-shell">
        <header className="c-topbar">
          <Link
            className="c-profile-chip"
            href="/profile"
            aria-label="Открыть профиль"
          >
            <span className="c-avatar">
              {user.telegramPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.telegramPhotoUrl} alt="" />
              ) : (
                <span className="c-avatar-fallback">{initials}</span>
              )}
            </span>
            <span className="c-profile-copy">
              <strong title={nick}>{nick}</strong>
              <small>Профиль&nbsp;/&nbsp;СВАГА+</small>
            </span>
          </Link>

          <div className="c-brand" aria-label="Бебебендл Competitive">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="c-brand-logo"
              src={COMPETITIVE_ICONS.logos.competitive}
              alt="Бебебендл Competitive"
              width={420}
              height={120}
            />
          </div>

          <nav className="c-top-actions" aria-label="Навигация">
            <CompetitiveLogout />
            <Link className="c-pixel-btn" href="/">
              ← На главную
            </Link>
            <div className="c-season-mini">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="c-season-mini-logo"
                src={COMPETITIVE_ICONS.logos.season1}
                alt=""
                width={96}
                height={48}
              />
              <span>
                <b className={mini.className || undefined}>{mini.label}</b>
                <small title={mini.name}>{mini.name}</small>
              </span>
            </div>
          </nav>
        </header>

        {children}
      </main>

      <footer className="c-footer">
        <p>
          Scrandle по еде зрителей стримера Olesha, дарованный
          <br />
          подписчиками платного тг-канала
        </p>
        {nextDailyAt ? (
          <p>
            До следующего дейлика:{" "}
            <strong>
              <HubCountdown
                targetIso={nextDailyAt}
                mode="hms"
                fallback="00:00:00"
              />
            </strong>
          </p>
        ) : null}
      </footer>
    </div>
  );
}
