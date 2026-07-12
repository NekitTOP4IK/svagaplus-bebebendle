"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface UserInfo {
  id: number;
  telegramId: number;
  telegramUsername: string | null;
  displayName: string | null;
  role: string;
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
  isSubscriberAtSubmit: boolean | null;
  submittedByUserId: number | null;
}

interface PlayHistoryItem {
  date: string;
  score: number;
  createdAt: string;
}

interface SvagaStatus {
  isSubscriber: boolean;
  svagaUserId: string | null;
  lastSyncedAt: string | null;
  linkedAt: string | null;
}

export default function ProfilePage(): JSX.Element {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [scrans, setScrans] = useState<Scran[]>([]);
  const [history, setHistory] = useState<PlayHistoryItem[]>([]);
  const [svagaStatus, setSvagaStatus] = useState<SvagaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [svagaLoading, setSvagaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/user/profile");
      if (res.status === 401) {
        setError("Не авторизован. Войдите через Telegram (используйте /admin для логина), чтобы просмотреть профиль.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setUser(data.user);
      setScrans(data.scrans || []);
    } catch (e) {
      setError("Ошибка загрузки профиля");
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/user/history");
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setHistory(data.history || []);
    } catch (e) {
      // history optional
    }
  }, []);

  const fetchSvagaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/svaga/status");
      if (res.status === 401) return;
      if (!res.ok) throw new Error("Failed svaga status");
      const data = await res.json();
      setSvagaStatus(data);
    } catch (e) {
      // ignore, may not be linked
      setSvagaStatus(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLinkError(null);
    await Promise.all([fetchProfile(), fetchHistory(), fetchSvagaStatus()]);
    setLoading(false);
  }, [fetchProfile, fetchHistory, fetchSvagaStatus]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSvagaAction = async () => {
    setSvagaLoading(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/svaga/link", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error || "Не удалось связать/обновить SVAGA+";
        setLinkError(msg);
        return;
      }
      // Refresh status after link/refresh
      await fetchSvagaStatus();
      // Also refresh profile in case subscriber flag affected anything (future)
      await fetchProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка SVAGA+";
      setLinkError(msg);
    } finally {
      setSvagaLoading(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("ru-RU");
    } catch {
      return d;
    }
  };

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

  if (error || !user) {
    return (
      <div className="retro-bg relative flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="retro-overlay absolute inset-0" />
        <div className="pixel-container relative z-10 w-full max-w-md rounded-none border-4 border-black bg-zinc-900 p-8 text-center text-white">
          <h1 className="pixel-text mb-4 text-2xl font-bold">Профиль</h1>
          <p className="mb-6 text-sm text-zinc-300">{error || "Не удалось загрузить данные профиля."}</p>
          <Link
            href="/"
            className="pixel-btn inline-block px-6 py-2 text-sm"
          >
            На главную
          </Link>
          <div className="mt-4 text-xs text-zinc-400">
            Для входа используйте виджет Telegram на странице админки.
          </div>
        </div>
      </div>
    );
  }

  const displayName = user.displayName || user.telegramUsername || `tg:${user.telegramId}`;

  return (
    <div className="retro-bg relative min-h-dvh px-4 py-8 text-white">
      <div className="retro-overlay absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="pixel-text text-3xl font-bold">Мой профиль</h1>
          <Link href="/" className="pixel-btn px-4 py-1 text-sm">
            ← На главную
          </Link>
        </div>

        {/* User info */}
        <div className="pixel-container mb-6 rounded-none border-4 border-black bg-zinc-900/90 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-lg font-bold">{displayName}</div>
              <div className="text-xs text-zinc-400">ID: {user.telegramId} • Роль: {user.role}</div>
            </div>
          </div>
        </div>

        {/* SVAGA+ Linking */}
        <div className="pixel-container mb-6 rounded-none border-4 border-black bg-zinc-900/90 p-4">
          <h2 className="pixel-text mb-3 text-xl font-bold">SVAGA+ статус</h2>
          {svagaStatus ? (
            <div className="mb-3 space-y-1 text-sm">
              <div>
                Статус:{" "}
                <span
                  className={`inline-flex rounded-none px-2 py-0.5 text-xs font-bold ${
                    svagaStatus.isSubscriber ? "bg-emerald-500 text-black" : "bg-zinc-600 text-white"
                  }`}
                >
                  {svagaStatus.isSubscriber ? "Подписчик SVAGA+" : "Не подписчик"}
                </span>
              </div>
              <div>Linked: {svagaStatus.svagaUserId ? "да" : "нет"}</div>
              <div>Last sync: {formatDate(svagaStatus.lastSyncedAt)}</div>
              <div>Linked at: {formatDate(svagaStatus.linkedAt)}</div>
            </div>
          ) : (
            <div className="mb-3 text-sm text-zinc-400">Статус не загружен или не связан.</div>
          )}
          <button
            onClick={handleSvagaAction}
            disabled={svagaLoading}
            className="pixel-btn px-4 py-2 text-sm disabled:opacity-60"
          >
            {svagaLoading ? "Обновление..." : svagaStatus?.svagaUserId ? "Обновить статус SVAGA+" : "Связать SVAGA+"}
          </button>
          <div className="mt-1 text-[10px] text-zinc-500">
            Нажмите, чтобы связать аккаунт или обновить подписку из SVAGA+.
          </div>
          {linkError && (
            <div className="mt-2 rounded-none border-2 border-red-500 bg-red-900/30 p-2 text-sm text-red-300">
              Ошибка привязки SVAGA+: {linkError}
              <button
                onClick={() => setLinkError(null)}
                className="ml-2 text-xs underline"
              >
                скрыть
              </button>
            </div>
          )}
        </div>

        {/* My Scrans */}
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
                    <th className="px-4 py-2 text-left">SVAGA+</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-700">
                  {scrans.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-800/40">
                      <td className="px-4 py-2 text-white/90">{s.id}</td>
                      <td className="px-4 py-2">
                        <div className="font-bold text-white">{s.name}</div>
                        {s.description && (
                          <div className="line-clamp-1 text-xs text-zinc-400">{s.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-none px-2 py-0.5 text-xs font-bold ${
                            s.approved ? "bg-green-500 text-white" : "bg-yellow-400 text-black"
                          }`}
                        >
                          {s.approved ? "Approved" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {s.isSubscriberAtSubmit && (
                          <span className="inline-flex rounded-none bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                            SVAGA+
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-2 text-[10px] text-zinc-500 border-t border-zinc-700">
            Дата показывается в боте. Здесь статус и отметка подписчика на момент отправки.
          </div>
        </div>

        {/* Play History */}
        <div className="pixel-container mb-6 overflow-hidden rounded-none border-4 border-black bg-zinc-900/90">
          <div className="bg-zinc-800 px-4 py-2">
            <h2 className="pixel-text text-lg font-bold">История игр ({history.length})</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-4 text-sm text-zinc-400">История пуста. Сыграйте в ежедневный скрандл!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/80">
                  <tr>
                    <th className="px-4 py-2 text-left">Дата</th>
                    <th className="px-4 py-2 text-left">Счёт</th>
                    <th className="px-4 py-2 text-left">Результаты</th>
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
                      <td className="px-4 py-2">
                        <Link
                          href="/daily"
                          className="text-xs text-emerald-400 underline hover:text-emerald-300"
                        >
                          Открыть ежедневку
                        </Link>
                        <span className="ml-2 text-[10px] text-zinc-500">(если куки сессии активны — увидите детали)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="p-2 text-[10px] text-zinc-500 border-t border-zinc-700">
            История по userId (анонимные/старые результаты могут отсутствовать до бэкофилла).
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={loadAll}
            className="pixel-btn px-6 py-2 text-sm"
            disabled={loading}
          >
            Обновить всё
          </button>
        </div>
      </div>
    </div>
  );
}
