"use client";

import { useCallback, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutCurrentSession } from "@/app/actions/auth";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";

export type SessionUser = Readonly<{
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  displayName: string | null;
  competitiveDisplayName?: string | null;
  role: "player" | "moderator" | "admin";
  isSubscriber: boolean | null;
}>;

function menuDisplayName(user: SessionUser): string {
  const competitive = user.competitiveDisplayName?.trim();
  if (competitive) return competitive;
  return (
    user.displayName?.trim() ||
    user.telegramUsername?.trim()?.replace(/^@+/, "") ||
    `tg:${user.telegramId}`
  );
}

function initials(user: SessionUser): string {
  const base = menuDisplayName(user);
  return base.slice(0, 2).toUpperCase();
}

function panelLabel(role: SessionUser["role"]): string {
  if (role === "admin") return "Админ-панель";
  if (role === "moderator") return "Модерация";
  return "";
}

/**
 * Single profile entry on home:
 * - logged out → «Профиль / СВАГА+»
 * - logged in → avatar + nick (+ badge) + meta «Профиль / СВАГА+» (no chip glow)
 */
export function HomeUserMenu({ user = null }: Readonly<{ user?: SessionUser | null }>): ReactElement {
  if (user === null) {
    return (
      <Link
        href="/profile"
        className="pixel-btn flex min-h-11 w-full items-center justify-center px-4 py-2 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Профиль / СВАГА+
      </Link>
    );
  }

  const name = menuDisplayName(user);
  const staff = user.role === "admin" || user.role === "moderator";
  const panel = panelLabel(user.role);
  const tone = resolveIdentityTone(user.role, user.isSubscriber);
  // Avatar ring only — no glowing chip on the whole button
  const avatarClass = tone === "default" ? "" : `user-avatar--${tone}`;
  const hasCompetitiveNick = Boolean(user.competitiveDisplayName?.trim());

  return (
    <div className="flex w-full flex-col gap-2">
      <Link
        href="/profile"
        className="pixel-btn flex min-h-11 items-center gap-3 overflow-visible px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
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
            {initials(user)}
          </span>
        )}
        <UserIdentity
          name={name}
          role={user.role}
          isSubscriber={user.isSubscriber}
          size="sm"
          className="min-w-0 flex-1"
          meta={
            hasCompetitiveNick ? "Профиль · Ranked ник" : "Профиль / СВАГА+"
          }
          showMetaSuffix={false}
          nickGlow
          pixelFont
        />
      </Link>

      {staff && (
        <Link
          href="/admin"
          className="pixel-btn pixel-btn-warn flex min-h-11 items-center justify-center px-4 py-2 text-center text-sm font-bold"
        >
          {panel}
        </Link>
      )}
    </div>
  );
}

/** @deprecated Use HomeUserMenu only — kept as alias for any old imports. */
export function HomeProfileRow(): ReactElement {
  return <HomeUserMenu />;
}

type LogoutButtonProps = Readonly<{
  className?: string;
}>;

/** Logout control for profile page only. */
export function LogoutButton({ className = "" }: LogoutButtonProps): ReactElement | null {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logoutCurrentSession();
    } catch {
      // ignore
    }
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loggingOut}
      title="Выйти"
      aria-label="Выйти"
      className={`pixel-btn pixel-btn-danger font-bold ${className}`}
    >
      {loggingOut ? "…" : "Выход"}
    </button>
  );
}
