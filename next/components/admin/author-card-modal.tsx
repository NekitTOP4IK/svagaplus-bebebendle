"use client";

import { useEffect, useState, type ReactElement } from "react";
import { apiFetch } from "@/lib/api-client";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";

type AuthorPayload = {
  telegramId: string;
  user: {
    id: number;
    username: string | null;
    displayName: string | null;
    photoUrl: string | null;
    role: string;
    isSubscriber: boolean | null;
  } | null;
  banned?: boolean;
  ban?: { reason: string; reasonCode: string; bannedAt: string | Date } | null;
  stats: { total: number; pending: number; approved: number; rejected: number };
  overPendingLimit: boolean;
  recent: Array<{
    id: number;
    name: string;
    price: number;
    approved: boolean;
    rejected: boolean;
    rejectReason: string | null;
    isSubscriberAtSubmit: boolean | null;
    imageUrl: string;
  }>;
};

type Props = Readonly<{
  telegramId: string | null;
  onClose: () => void;
  onFilterAuthor?: (telegramId: string) => void;
  onBanUser?: (telegramId: string, displayName?: string | null) => void;
}>;

export function AuthorCardModal({
  telegramId,
  onClose,
  onFilterAuthor,
  onBanUser,
}: Props): ReactElement | null {
  const [data, setData] = useState<AuthorPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!telegramId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await apiFetch(
          `/api/admin/authors?telegram_id=${encodeURIComponent(telegramId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setError("Не удалось загрузить автора");
          return;
        }
        const json = (await res.json()) as AuthorPayload;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Ошибка сети");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [telegramId]);

  if (!telegramId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pixel-container max-h-[85dvh] w-full max-w-lg overflow-y-auto border-4 border-black bg-zinc-900 p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="pixel-text text-lg font-bold text-white">Карточка автора</h2>
          <button
            type="button"
            onClick={onClose}
            className="pixel-btn px-2 py-1 text-sm font-bold"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-white/60">Загрузка…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && (
          <div className="space-y-4">
            <AuthorHeader data={data} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["Всего", data.stats.total],
                  ["В очереди", data.stats.pending],
                  ["Одобрено", data.stats.approved],
                  ["Отклонено", data.stats.rejected],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="border-2 border-zinc-700 bg-zinc-950 px-2 py-2">
                  <p className="text-[10px] uppercase text-white/40">{label}</p>
                  <p
                    className={`text-lg font-bold ${
                      label === "В очереди" && data.overPendingLimit
                        ? "text-red-400"
                        : "text-white"
                    }`}
                  >
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {data.overPendingLimit && (
              <p className="text-xs font-bold text-red-400">
                Превышен лимит 6 pending — приоритет в очереди снижен
              </p>
            )}

            <div className="flex flex-col gap-2">
              {onFilterAuthor && (
                <button
                  type="button"
                  onClick={() => {
                    onFilterAuthor(data.telegramId);
                    onClose();
                  }}
                  className="pixel-btn w-full px-3 py-2 text-sm font-bold"
                >
                  Фильтр по автору
                </button>
              )}
              {onBanUser && !data.banned && data.user?.role !== "admin" && data.user?.role !== "moderator" && (
                <button
                  type="button"
                  onClick={() =>
                    onBanUser(
                      data.telegramId,
                      data.user?.displayName || data.user?.username || null,
                    )
                  }
                  className="pixel-btn pixel-btn-danger w-full px-3 py-2 text-sm font-bold"
                >
                  Забанить пользователя
                </button>
              )}
              {onBanUser && !data.banned && !data.user && (
                <button
                  type="button"
                  onClick={() => onBanUser(data.telegramId, null)}
                  className="pixel-btn pixel-btn-danger w-full px-3 py-2 text-sm font-bold"
                >
                  Забанить пользователя
                </button>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">
                Недавние
              </h3>
              <ul className="space-y-2">
                {data.recent.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-sm"
                  >
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" className="h-10 w-10 object-cover" />
                    ) : (
                      <span className="h-10 w-10 bg-zinc-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-white">
                        #{s.id} {s.name}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {s.approved ? "approved" : s.rejected ? `rejected${s.rejectReason ? `: ${s.rejectReason}` : ""}` : "pending"}
                        {" · "}
                        {s.price.toFixed(0)} ₽
                      </p>
                    </div>
                  </li>
                ))}
                {data.recent.length === 0 && (
                  <li className="text-sm text-white/40">Нет сабмитов</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthorHeader({ data }: { data: AuthorPayload }): ReactElement {
  const displayName =
    data.user?.displayName || data.user?.username || `tg:${data.telegramId}`;
  const tone = resolveIdentityTone(
    data.user?.role,
    data.user?.isSubscriber ?? null,
  );
  const avatarRing = tone === "default" ? "" : `user-avatar--${tone}`;
  const meta = [
    `id ${data.telegramId}`,
    data.user?.username ? `@${data.user.username}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3 overflow-visible">
      {data.user?.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.user.photoUrl}
          alt=""
          className={`h-12 w-12 shrink-0 border-2 border-black object-cover ${avatarRing}`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-sm font-bold text-white ${avatarRing}`}
        >
          TG
        </span>
      )}
      <div className="min-w-0 flex-1 overflow-visible">
        <UserIdentity
          name={displayName}
          role={data.user?.role}
          isSubscriber={data.user?.isSubscriber ?? null}
          size="sm"
          meta={meta}
        />
        {data.banned && (
          <p className="mt-1 text-xs font-bold text-red-400">
            🚫 ЗАБАНЕН
            {data.ban?.reason ? `: ${data.ban.reason}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
