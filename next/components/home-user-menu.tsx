"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

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

export function HomeUserMenu(): ReactElement | null {
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

  if (user === undefined || user === null) {
    return null;
  }

  const name = user.displayName || user.telegramUsername || `tg:${user.telegramId}`;
  const staff = user.role === "admin" || user.role === "moderator";
  const panel = panelLabel(user.role);
  const isSub = user.isSubscriber === true;

  return (
    <div className="flex w-full flex-col gap-2">
      <Link
        href="/profile"
        className={`pixel-btn flex min-h-11 items-center gap-3 px-3 py-2 text-left ${
          isSub ? "subscriber-chip" : ""
        }`}
      >
        {user.telegramPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.telegramPhotoUrl}
            alt=""
            className={`h-9 w-9 shrink-0 border-2 border-black object-cover ${
              isSub ? "subscriber-avatar" : ""
            }`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-xs font-bold text-white ${
              isSub ? "subscriber-avatar" : ""
            }`}
          >
            {initials(user)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-bold ${
              isSub ? "subscriber-nick" : "text-white"
            }`}
          >
            {name}
            {isSub ? " ✦" : ""}
          </span>
          <span className="block truncate text-[10px] text-white/60">
            {user.telegramUsername ? `@${user.telegramUsername}` : "профиль"}
            {staff ? ` · ${user.role}` : ""}
            {isSub && !staff ? " · СВАГА+" : ""}
          </span>
        </span>
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

/** Profile CTA with logout button protruding left of the column when logged in. */
export function HomeProfileRow(): ReactElement {
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
    window.location.reload();
  }, []);

  const loggedIn = user != null;

  return (
    <div className="relative w-full overflow-visible">
      {loggedIn && (
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          title="Выйти"
          aria-label="Выйти"
          className="pixel-btn pixel-btn-danger absolute top-1/2 z-20 flex h-11 min-w-[2.75rem] -translate-y-1/2 items-center justify-center px-2 text-xs font-bold"
          style={{
            right: "100%",
            marginRight: "0.5rem",
            transition:
              "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease",
          }}
        >
          {loggingOut ? "…" : "Выход"}
        </button>
      )}
      <Link
        href="/profile"
        className="pixel-btn flex min-h-11 w-full items-center justify-center px-4 py-2 text-center text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Профиль / СВАГА+
      </Link>
    </div>
  );
}
