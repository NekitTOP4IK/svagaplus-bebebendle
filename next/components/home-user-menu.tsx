"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

type SessionUser = Readonly<{
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  telegramPhotoUrl: string | null;
  displayName: string | null;
  role: "player" | "moderator" | "admin";
}>;

function initials(user: SessionUser): string {
  const base = user.displayName || user.telegramUsername || "?";
  return base.slice(0, 2).toUpperCase();
}

function panelLabel(role: SessionUser["role"]): string {
  if (role === "admin") return "Админка";
  if (role === "moderator") return "Модерация";
  return "";
}

export function HomeUserMenu(): ReactElement | null {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/auth/session");
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = (await res.json()) as { user: SessionUser | null };
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
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

  return (
    <div className="flex w-full flex-col gap-2">
      <Link
        href="/profile"
        className="pixel-btn flex min-h-11 items-center gap-3 px-3 py-2 text-left"
      >
        {user.telegramPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.telegramPhotoUrl}
            alt=""
            className="h-9 w-9 shrink-0 border-2 border-black object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-xs font-bold text-white">
            {initials(user)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-white">{name}</span>
          <span className="block truncate text-[10px] text-white/60">
            {user.telegramUsername ? `@${user.telegramUsername}` : "профиль"}
            {staff ? ` · ${user.role}` : ""}
          </span>
        </span>
      </Link>

      {staff && (
        <Link
          href="/admin"
          className="pixel-btn flex min-h-11 items-center justify-center bg-amber-400 px-4 py-2 text-center text-sm font-bold text-black hover:bg-amber-300"
        >
          {panel}
        </Link>
      )}
    </div>
  );
}
