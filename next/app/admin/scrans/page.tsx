"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  Suspense,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAdminScranAction } from "@/app/actions/admin/queries";
import { auditActionLabel, auditDetailsPreview } from "@/lib/audit-labels";
import { ScranImageLightbox } from "@/components/admin/scran-image-lightbox";
import { UserIdentity } from "@/components/user-identity";
import { resolveIdentityTone } from "@/lib/user-identity";
import { toast } from "sonner";
import {
  grantAdminDailyReentry,
  revokeAdminDailyReentry,
} from "@/app/actions/admin-daily";

type ScranDetail = {
  scran: {
    id: number;
    imageUrl: string;
    name: string;
    description: string | null;
    price: number;
    numberOfLikes: number;
    numberOfDislikes: number;
    approved: boolean;
    rejected: boolean;
    rejectReason: string | null;
    rejectedAt: string | null;
    telegramId: string | null;
    icon: string | null;
    submittedByUserId: number | null;
    isSubscriberAtSubmit: boolean | null;
    subscriberCheckedAt: string | null;
  };
  author: {
    id: number;
    telegramUsername: string | null;
    displayName: string | null;
    telegramPhotoUrl: string | null;
    role: string;
    isSubscriber: boolean | null;
  } | null;
  daily: Array<{ date: string; roundNumber: number; side: string }>;
  dailyReentry: {
    grantedAt: string;
    reason: string | null;
    consumedAt: string | null;
    consumedForDate: string | null;
    revokedAt: string | null;
  } | null;
  viewerRole: string;
  audit: Array<{
    id: number;
    action: string;
    details: string | null;
    createdAt: string;
    actorUsername: string | null;
    actorDisplayName: string | null;
  }>;
};

function ScranDetailInner(): ReactElement {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const [data, setData] = useState<ScranDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reentryBusy, setReentryBusy] = useState(false);

  const load = useCallback(async () => {
    if (!idParam || Number.isNaN(Number(idParam))) {
      setError("Укажи id: /admin/scrans?id=N");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getAdminScranAction(Number(idParam));
      if (!res.success && res.message === "Unauthorized") {
        setError("Нужна авторизация staff");
        return;
      }
      if (!res.success) {
        setError("Скран не найден");
        return;
      }
      setData(res.data as ScranDetail);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, [idParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateDailyReentry = async (grant: boolean) => {
    if (!data || data.viewerRole !== "admin") return;
    setReentryBusy(true);
    try {
      const result = grant
        ? await grantAdminDailyReentry({ ids: [data.scran.id] })
        : await revokeAdminDailyReentry({ ids: [data.scran.id] });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(grant ? "Повторный допуск выдан" : "Повторный допуск отозван");
      await load();
    } catch {
      toast.error("Не удалось обновить допуск");
    } finally {
      setReentryBusy(false);
    }
  };

  return (
    <div className="retro-bg relative min-h-dvh">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="pixel-text text-2xl font-bold">Карточка скрана</h1>
          <Link href="/admin" className="pixel-btn px-3 py-2 text-sm font-bold">
            ← Админ-панель
          </Link>
        </div>

        {loading && <p className="text-white/60">Загрузка…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {data && (
          <div className="space-y-4">
            <div className="pixel-container flex flex-col gap-4 border-4 border-black bg-zinc-900/90 p-4 sm:flex-row">
              {data.scran.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="group relative mx-auto shrink-0 border-2 border-black sm:mx-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                  title="Открыть полностью"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.scran.imageUrl}
                    alt={data.scran.name}
                    className="h-48 w-48 object-cover sm:h-56 sm:w-56"
                  />
                  <span className="absolute bottom-1 right-1 border border-black bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-90 group-hover:opacity-100">
                    полный размер
                  </span>
                </button>
              ) : (
                <div className="flex h-48 w-48 items-center justify-center border-2 border-zinc-700 text-white/40">
                  нет фото
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2 text-white">
                <p className="text-xs text-white/45">#{data.scran.id}</p>
                <h2 className="pixel-text text-2xl font-bold">
                  {data.scran.name}
                </h2>
                {data.scran.description && (
                  <p className="text-sm text-zinc-300">
                    {data.scran.description}
                  </p>
                )}
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      Цена
                    </dt>
                    <dd className="font-bold">
                      {data.scran.price.toFixed(2)} ₽
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      Лайки
                    </dt>
                    <dd className="font-bold">👍 {data.scran.numberOfLikes}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      Дизлайки
                    </dt>
                    <dd className="font-bold">
                      👎 {data.scran.numberOfDislikes}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      Статус
                    </dt>
                    <dd className="font-bold">
                      {data.scran.approved
                        ? "Одобрен"
                        : data.scran.rejected
                          ? "Отклонён"
                          : "В очереди"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      SVAGA при сабмите
                    </dt>
                    <dd className="font-bold">
                      {data.scran.isSubscriberAtSubmit === true
                        ? "да"
                        : data.scran.isSubscriberAtSubmit === false
                          ? "нет"
                          : "не проверено"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-white/40">
                      Telegram id
                    </dt>
                    <dd className="font-bold">
                      {data.scran.telegramId || "—"}
                    </dd>
                  </div>
                </dl>
                {data.scran.rejectReason && (
                  <p className="text-sm text-red-300">
                    Причина отклонения: {data.scran.rejectReason}
                  </p>
                )}
              </div>
            </div>

            <div className="pixel-container overflow-visible border-4 border-black bg-zinc-900/90 p-4 text-white">
              <h3 className="pixel-text mb-3 text-lg font-bold">Автор</h3>
              {data.author ? (
                <AuthorBlock
                  author={data.author}
                  telegramId={data.scran.telegramId}
                />
              ) : (
                <p className="text-sm text-white/50">
                  Локальный user не привязан
                  {data.scran.telegramId
                    ? ` · tg:${data.scran.telegramId}`
                    : ""}
                </p>
              )}
            </div>

            <div className="pixel-container border-4 border-black bg-zinc-900/90 p-4 text-white">
              <h3 className="pixel-text mb-3 text-lg font-bold">Daily</h3>
              {data.daily.length === 0 ? (
                <p className="text-sm text-white/50">
                  Ещё не попадал в ротацию
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.daily.map((d) => (
                    <li key={`${d.date}-${d.roundNumber}`}>
                      {d.date} · раунд {d.roundNumber} · слот {d.side}
                    </li>
                  ))}
                </ul>
              )}
              {data.dailyReentry && !data.dailyReentry.consumedAt && !data.dailyReentry.revokedAt ? (
                <div className="mt-4 border-2 border-emerald-700 bg-emerald-950/40 p-3 text-sm">
                  <p className="font-bold text-emerald-300">Повторный допуск активен</p>
                  <p className="mt-1 text-xs text-white/55">
                    Выдан {new Date(data.dailyReentry.grantedAt).toLocaleString("ru-RU")}
                    {data.dailyReentry.reason ? ` · ${data.dailyReentry.reason}` : ""}
                  </p>
                  {data.viewerRole === "admin" && (
                    <button
                      type="button"
                      disabled={reentryBusy}
                      onClick={() => void updateDailyReentry(false)}
                      className="pixel-btn pixel-btn-warn mt-3 px-3 py-1.5 text-xs font-bold"
                    >
                      Отозвать допуск
                    </button>
                  )}
                </div>
              ) : data.viewerRole === "admin" && data.scran.approved && data.daily.length > 0 ? (
                <button
                  type="button"
                  disabled={reentryBusy}
                  onClick={() => void updateDailyReentry(true)}
                  className="pixel-btn pixel-btn-info mt-4 px-3 py-2 text-sm font-bold"
                >
                  {reentryBusy ? "Сохраняем…" : "Разрешить ещё одно участие"}
                </button>
              ) : null}
            </div>

            <div className="pixel-container border-4 border-black bg-zinc-900/90 p-4 text-white">
              <h3 className="pixel-text mb-3 text-lg font-bold">
                История действий
              </h3>
              {data.audit.length === 0 ? (
                <p className="text-sm text-white/50">Пока пусто</p>
              ) : (
                <ul className="divide-y divide-zinc-800 text-sm">
                  {data.audit.map((a) => (
                    <li key={a.id} className="py-2">
                      <p className="font-bold">{auditActionLabel(a.action)}</p>
                      <p className="text-xs text-white/50">
                        {new Date(a.createdAt).toLocaleString("ru-RU")} ·{" "}
                        {a.actorDisplayName || a.actorUsername || "—"}
                      </p>
                      <p className="text-xs text-white/60">
                        {auditDetailsPreview(a.details)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {lightboxOpen && data?.scran.imageUrl && (
          <ScranImageLightbox
            src={data.scran.imageUrl}
            alt={data.scran.name}
            onClose={() => setLightboxOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function AuthorBlock({
  author,
  telegramId,
}: {
  author: NonNullable<ScranDetail["author"]>;
  telegramId: string | null;
}): ReactElement {
  const name =
    author.displayName ||
    author.telegramUsername ||
    (telegramId ? `tg:${telegramId}` : "—");
  const tone = resolveIdentityTone(author.role, author.isSubscriber);
  const avatarRing = tone === "default" ? "" : `user-avatar--${tone}`;
  // Role/SVAGA label comes once from identityMetaSuffix — don't put role here
  const meta = [
    author.telegramUsername ? `@${author.telegramUsername}` : null,
    telegramId ? `tg:${telegramId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3 overflow-visible text-sm">
      {author.telegramPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.telegramPhotoUrl}
          alt=""
          className={`h-12 w-12 shrink-0 border-2 border-black object-cover ${avatarRing}`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center border-2 border-black bg-zinc-800 text-xs font-bold ${avatarRing}`}
        >
          TG
        </span>
      )}
      <UserIdentity
        name={name}
        role={author.role}
        isSubscriber={author.isSubscriber}
        size="sm"
        className="min-w-0 flex-1"
        meta={meta}
      />
    </div>
  );
}

export default function AdminScranPage(): ReactElement {
  return (
    <Suspense
      fallback={
        <div className="retro-bg flex min-h-dvh items-center justify-center text-white">
          Загрузка…
        </div>
      }
    >
      <ScranDetailInner />
    </Suspense>
  );
}
