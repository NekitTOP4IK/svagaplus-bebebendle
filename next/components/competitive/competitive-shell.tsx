import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import type { CurrentUser } from "@/lib/auth-server";
import type { HubSeasonSummary } from "@/lib/competitive/hub";
import { COMPETITIVE_ICONS } from "@/lib/competitive/icons";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";
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
 * Competitive shell: full-page hub chrome.
 * Profile chip matches home (UserIdentity + badge/glow). No logout here.
 */
export function CompetitiveShell({
  user,
  season,
  children,
}: Props): ReactElement {
  const nick =
    user.displayName ||
    user.telegramUsername ||
    `tg:${user.telegramId}`;
  const initials = nick.slice(0, 2).toUpperCase();
  const mini = seasonMiniStatus(season);
  const tone = resolveIdentityTone(user.role, user.isSubscriber);
  const avatarClass = tone === "default" ? "" : `user-avatar--${tone}`;

  return (
    <div className="c-hub">
      <div className="c-hub-bg" aria-hidden>
        <div className="c-hub-bg__image" />
        <div className="c-hub-bg__shade" />
      </div>
      <main className="c-shell">
        <header className="c-topbar">
          <Link
            href="/profile"
            className="pixel-btn c-profile-chip flex min-h-11 items-center gap-3 overflow-visible px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            aria-label="Открыть профиль"
          >
            {user.telegramPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.telegramPhotoUrl}
                alt=""
                className={`h-9 w-9 shrink-0 border-2 border-black object-cover ${avatarClass}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-xs font-bold text-white ${avatarClass}`}
              >
                {initials}
              </span>
            )}
            <UserIdentity
              name={nick}
              role={user.role}
              isSubscriber={user.isSubscriber}
              size="sm"
              className="min-w-0 flex-1"
              meta="Профиль / СВАГА+"
              showMetaSuffix={false}
              nickGlow
            />
          </Link>

          <div className="c-brand" aria-label="Бебебендл Competitive">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="c-brand-logo"
              src={COMPETITIVE_ICONS.logos.competitive}
              alt="Бебебендл Competitive"
              width={360}
              height={100}
            />
          </div>

          <nav className="c-top-actions" aria-label="Навигация">
            <Link
              className="pixel-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
              href="/"
            >
              ← На главную
            </Link>
            <div className="c-season-mini">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="c-season-mini-pearl"
                src={COMPETITIVE_ICONS.pearl}
                alt=""
                width={36}
                height={36}
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

      <footer className="c-footer" aria-label="О проекте">
        <p className="c-footer-tagline">
          Scrandle по еде зрителей стримера Olesha, дарованный подписчиками
          платного тг-канала
        </p>
      </footer>
    </div>
  );
}
