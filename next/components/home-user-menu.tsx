"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";

type SessionUser = Readonly<{
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  displayName: string | null;
  role: "player" | "moderator" | "admin";
  isSubscriber: boolean | null;
}>;

function initials(user: SessionUser): string {
  const base = user.displayName || user.telegramUsername || "?";
  return base.slice(0, 2).toUpperCase();
}

function panelLabel(role: SessionUser["role"]): string {
  if (role === "admin") return "Админ-панель";
  if (role === "moderator") return "Модерация";
  return "";
}

async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    const res = await apiFetch("/api/auth/session");
    if (!res.ok) return null;
    const data = (await res.json()) as { user: SessionUser | null };
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Single profile entry on home:
 * - logged out → «Профиль / СВАГА+»
 * - logged in → avatar + nick (+ badge) + meta «Профиль / СВАГА+» (no chip glow)
 */
export function HomeUserMenu(): ReactElement {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Loading: same footprint as CTA to avoid layout jump
  if (user === undefined) {
    return (
      <div
        className="pixel-btn flex min-h-11 w-full items-center justify-center px-4 py-2 text-center text-sm font-bold opacity-50"
        aria-hidden
      >
        …
      </div>
    );
  }

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

  const name = user.displayName || user.telegramUsername || `tg:${user.telegramId}`;
  const staff = user.role === "admin" || user.role === "moderator";
  const panel = panelLabel(user.role);
  const tone = resolveIdentityTone(user.role, user.isSubscriber);
  // Avatar ring only — no glowing chip on the whole button
  const avatarClass = tone === "default" ? "" : `user-avatar--${tone}`;

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
          meta="Профиль / СВАГА+"
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
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSessionUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // ignore
    }
    window.location.href = "/";
  }, []);

  if (user === undefined || user === null) {
    return null;
  }

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
