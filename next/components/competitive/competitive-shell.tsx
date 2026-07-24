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
  /** @deprecated unused — seasons hub is always linked under «На главную» */
  previousEndedSeason?: unknown;
  children: ReactNode;
}>;

/**
 * Competitive shell: full-page hub chrome.
 * Profile: plain avatar + nick glow/badge (not a button). No logout here.
 * Under home: link to seasons archive hub (past season results).
 */
export function CompetitiveShell({
  user,
  children,
}: Props): ReactElement {
  const rawTg = user.telegramUsername?.trim().replace(/^@+/, "") || null;
  const nick =
    user.competitiveDisplayName?.trim() ||
    user.displayName?.trim() ||
    rawTg ||
    `Игрок #${user.id}`;
  const initials = nick.slice(0, 2).toUpperCase();
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
            className="c-profile-plain"
            aria-label="Открыть профиль"
          >
            {user.telegramPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.telegramPhotoUrl}
                alt=""
                className={`h-10 w-10 shrink-0 border-2 border-black object-cover ${avatarClass}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-xs font-bold text-white ${avatarClass}`}
              >
                {initials}
              </span>
            )}
            <UserIdentity
              name={nick}
              role={user.role}
              isSubscriber={user.isSubscriber}
              size="sm"
              className="c-profile-identity min-w-0 flex-1"
              meta="Авторизован"
              showMetaSuffix={false}
              nickGlow
              pixelFont
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
            <Link
              href="/competitive/seasons"
              className="pixel-btn pixel-btn-warn c-seasons-hub-btn px-3 py-1.5 text-xs font-bold sm:text-sm"
              title="Архив сезонов и итоги"
            >
              Сезоны
            </Link>
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
