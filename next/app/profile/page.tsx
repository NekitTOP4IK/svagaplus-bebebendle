"use client";

import { useState, useEffect, useCallback, type ReactElement } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { TelegramLogin } from "@/components/telegram-login";
import {
  ProfileSvagaStatus,
  type LocalSvagaStatus,
} from "@/components/profile-svaga-status";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";
import { LogoutButton } from "@/components/home-user-menu";

interface UserInfo {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  telegramPhotoUrl?: string | null;
  displayName: string | null;
  role: string;
  isSubscriber?: boolean | null;
}

interface Scran {
  id: number;
  imageUrl: string;
  name: string;
  description: string | null;
  price: number;
  numberOfLikes: number;
  numberOfDislikes: number;
  approved: boolean;
  rejected?: boolean;
  rejectReason?: string | null;
  isSubscriberAtSubmit: boolean | null;
  submittedByUserId: number | null;
}

function scranStatusLabel(s: Scran): { text: string; className: string } {
  if (s.approved) {
    return { text: "Одобрено", className: "bg-green-500 text-white" };
  }
  if (s.rejected) {
    return { text: "Отклонено", className: "bg-red-500 text-white" };
  }
  return { text: "На модерации", className: "bg-yellow-400 text-black" };
}

interface PlayHistoryItem {
  date: string;
  score: number;
  createdAt: string;
}

export default function ProfilePage(): ReactElement {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [scrans, setScrans] = useState<Scran[]>([]);
  const [history, setHistory] = useState<PlayHistoryItem[]>([]);
  const [svagaStatus, setSvagaStatus] = useState<LocalSvagaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/user/profile");
      if (res.status === 401) {
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setUser(data.user);
      setScrans(data.scrans || []);
    } catch {
      setError("Ошибка загрузки профиля");
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/user/history");
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch {
      // history optional
    }
  }, []);

  const fetchSvagaStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/svaga/status");
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed svaga status");
      const data = (await res.json()) as LocalSvagaStatus;
      setSvagaStatus(data);
    } catch {
      setSvagaStatus(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchProfile(), fetchHistory(), fetchSvagaStatus()]);
    setLoading(false);
  }, [fetchProfile, fetchHistory, fetchSvagaStatus]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleLogin = useCallback(async (data: Record<string, string>) => {
    const response = await fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) return false;
    await loadAll();
    return true;
  }, [loadAll]);

  if (loading) {
    return (
      <div className="retro-bg relative flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="retro-overlay absolute inset-0" />
        <div className="pixel-container relative z-10 rounded-none border-4 border-black bg-zinc-900 p-8 text-white">
          <div className="pixel-text text-xl">Загрузка профиля...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="retro-bg relative flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="retro-overlay absolute inset-0" />
        <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-zinc-900 p-8 text-center text-white">
          <h1 className="pixel-text mb-4 text-2xl font-bold">Профиль</h1>
          <p className="mb-6 text-sm text-zinc-300">{error}</p>
          <Link href="/" className="pixel-btn inline-block min-h-11 px-6 py-2 text-sm">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="retro-bg relative flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="retro-overlay pointer-events-none fixed inset-0" />
        <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-zinc-900/95 p-8 text-center">
          <h1 className="pixel-text mb-4 text-2xl font-bold">Профиль</h1>
          <p className="mb-4 text-sm text-white/80">
            Войдите через Telegram, чтобы увидеть профиль и проверить подписку СВАГА+.
          </p>
          <TelegramLogin onAuthenticated={handleLogin} context="player" />
          <Link href="/" className="pixel-btn mt-6 inline-block min-h-11 px-6 py-2 text-sm">
            На главную
          </Link>
        </div>
      </div>
    );
  }

  const displayName = user.displayName || user.telegramUsername || `tg:${user.telegramId}`;
  const tone = resolveIdentityTone(user.role, user.isSubscriber ?? null);
  const avatarRing = tone === "default" ? "" : `user-avatar--${tone}`;
  const chipRing = tone === "default" ? "" : `user-chip--${tone}`;

  return (
    <div className="retro-bg relative min-h-dvh px-4 py-8 text-white">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="pixel-text text-3xl font-bold">Мой профиль</h1>
          <div className="flex flex-wrap items-center gap-2">
            <LogoutButton className="min-h-11 px-4 py-2 text-sm" />
            <Link
              href="/"
              className="pixel-btn min-h-11 px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              ← На главную
            </Link>
          </div>
        </div>

        <div
          className={`pixel-container mb-6 overflow-visible rounded-none border-4 border-black bg-zinc-900/90 p-4 ${chipRing}`}
        >
          <div className="flex min-w-0 items-center gap-3 overflow-visible">
            {user.telegramPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.telegramPhotoUrl}
                alt=""
                className={`h-14 w-14 shrink-0 border-2 border-black object-cover ${avatarRing}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-sm font-bold ${avatarRing}`}
              >
                {(displayName || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
            <UserIdentity
              name={displayName}
              role={user.role}
              isSubscriber={user.isSubscriber ?? null}
              size="lg"
              className="min-w-0 flex-1"
              meta={`ID: ${user.telegramId}`}
            />
          </div>
        </div>

        <ProfileSvagaStatus initialStatus={svagaStatus} />

        <div className="pixel-container mb-6 overflow-hidden rounded-none border-4 border-black bg-zinc-900/90">
          <div className="bg-zinc-800 px-4 py-2">
            <h2 className="pixel-text text-lg font-bold">Мои скраны ({scrans.length})</h2>
          </div>
          {scrans.length === 0 ? (
            <div className="p-4 text-sm text-zinc-400">Вы ещё не предлагали скраны.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/80">
                  <tr>
                    <th className="px-4 py-2 text-left">ID</th>
                    <th className="px-4 py-2 text-left">Название</th>
                    <th className="px-4 py-2 text-left">Статус</th>
                    <th className="px-4 py-2 text-left">СВАГА+</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {scrans.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-2 text-white/90">{s.id}</td>
                      <td className="px-4 py-2">
                        <div className="font-bold text-white">{s.name}</div>
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const st = scranStatusLabel(s);
                          return (
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex w-fit rounded-none px-2 py-0.5 text-xs font-bold ${st.className}`}
                              >
                                {st.text}
                              </span>
                              {s.rejected && s.rejectReason ? (
                                <span
                                  className="max-w-[14rem] truncate text-[10px] text-zinc-400"
                                  title={s.rejectReason}
                                >
                                  {s.rejectReason}
                                </span>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        {s.isSubscriberAtSubmit === true && (
                          <span className="inline-flex rounded-none bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                            SVAGA+
                          </span>
                        )}
                        {s.isSubscriberAtSubmit === null && (
                          <span className="inline-flex rounded-none bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Не проверено
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pixel-container mb-6 overflow-hidden rounded-none border-4 border-black bg-zinc-900/90">
          <div className="bg-zinc-800 px-4 py-2">
            <h2 className="pixel-text text-lg font-bold">История игр ({history.length})</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-4 text-sm text-zinc-400">История пуста.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/80">
                  <tr>
                    <th className="px-4 py-2 text-left">Дата</th>
                    <th className="px-4 py-2 text-left">Счёт</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {history.map((h, idx) => (
                    <tr key={`${h.date}-${idx}`} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-2 font-mono text-white/90">{h.date}</td>
                      <td className="px-4 py-2">
                        <span className="font-bold text-white">{h.score}</span>
                        <span className="text-zinc-400"> / 10</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="pixel-btn min-h-11 px-6 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            disabled={loading}
          >
            Обновить всё
          </button>
        </div>
      </div>
    </div>
  );
}
