"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { Scran } from "@/types/scran";
import { ScranImageLightbox } from "@/components/admin/scran-image-lightbox";

type Props = Readonly<{
  scrans: Scran[];
  role?: "moderator" | "admin" | null;
  busy?: boolean;
  onApprove: (id: number) => void | Promise<void>;
  onReject: (id: number) => void | Promise<void>;
  onExit: () => void;
  onNeedMore?: () => void;
  hasMorePages?: boolean;
}>;

function authorLabel(scran: Scran): string {
  return (
    scran.authorUsername ||
    scran.authorDisplayName ||
    (scran.telegramId ? `tg:${scran.telegramId}` : "аноним")
  );
}

export function ModerationReview({
  scrans,
  busy = false,
  onApprove,
  onReject,
  onExit,
  onNeedMore,
  hasMorePages = false,
}: Props): ReactElement {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const current = scrans[index] ?? null;
  const remaining = Math.max(scrans.length - index, 0);

  useEffect(() => {
    if (index >= scrans.length && scrans.length > 0) {
      setIndex(0);
    }
  }, [scrans, index]);

  useEffect(() => {
    if (!current && hasMorePages) {
      onNeedMore?.();
    }
  }, [current, hasMorePages, onNeedMore]);

  // After approve/reject parent refetches and drops the item; stay on index 0.
  const handleApprove = useCallback(async () => {
    if (!current || acting || busy) return;
    setActing(true);
    try {
      await onApprove(current.id);
      setIndex(0);
    } finally {
      setActing(false);
    }
  }, [current, acting, busy, onApprove]);

  const handleReject = useCallback(async () => {
    if (!current || acting || busy) return;
    setActing(true);
    try {
      await onReject(current.id);
      setIndex(0);
    } finally {
      setActing(false);
    }
  }, [current, acting, busy, onReject]);

  const handleSkip = useCallback(() => {
    if (acting || busy) return;
    setIndex((i) => i + 1);
  }, [acting, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowRight" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        void handleApprove();
      } else if (e.key === "ArrowLeft" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        void handleReject();
      } else if (e.key === "s" || e.key === "S" || e.key === " ") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleApprove, handleReject, handleSkip, onExit]);

  if (!current) {
    return (
      <div className="pixel-container border-4 border-black bg-zinc-900/90 px-6 py-16 text-center">
        <p className="pixel-text text-xl font-bold text-white">На этой странице всё разобрано</p>
        <p className="mt-2 text-sm text-white/60">
          {hasMorePages
            ? "Загрузи следующую страницу или выйди в список."
            : "Очередь пуста. Можно выдохнуть."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hasMorePages && (
            <button
              type="button"
              onClick={() => onNeedMore?.()}
              className="pixel-btn bg-amber-400 px-4 py-2 text-sm font-bold text-black"
            >
              Дальше по очереди
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="pixel-btn bg-zinc-700 px-4 py-2 text-sm font-bold text-white"
          >
            К списку
          </button>
        </div>
      </div>
    );
  }

  const disabled = acting || busy;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="pixel-btn bg-zinc-800 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700"
        >
          ← Список
        </button>
        <p className="text-xs text-white/60 sm:text-sm">
          Осталось на странице:{" "}
          <span className="font-bold text-white">{remaining}</span>
        </p>
      </div>

      <article className="pixel-container overflow-hidden border-4 border-black bg-zinc-900/95">
        <button
          type="button"
          className="relative block w-full bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          onClick={() => current.imageUrl && setLightboxOpen(true)}
          disabled={!current.imageUrl}
        >
          {current.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.imageUrl}
              alt={current.name}
              className="mx-auto max-h-[min(58dvh,520px)] w-full object-contain"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-white/40">нет фото</div>
          )}
          {current.imageUrl && (
            <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 text-[10px] font-bold text-white">
              нажми для полного размера
            </span>
          )}
        </button>

        <div className="space-y-3 border-t-4 border-black p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-white/45">#{current.id}</p>
              <h2 className="pixel-text text-xl font-bold text-white sm:text-2xl">
                {current.name}
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {current.isSubscriberAtSubmit === true && (
                <span className="bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-black">
                  SVAGA+
                </span>
              )}
              {current.isSubscriberAtSubmit === null && (
                <span className="bg-zinc-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  Не проверено
                </span>
              )}
            </div>
          </div>

          {current.description && (
            <p className="text-sm leading-relaxed text-zinc-300">{current.description}</p>
          )}

          <dl className="grid grid-cols-2 gap-2 text-sm text-white/80 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Цена</dt>
              <dd className="font-bold text-white">{current.price.toFixed(2)} ₽</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Автор</dt>
              <dd className="truncate font-bold text-white">{authorLabel(current)}</dd>
            </div>
            {typeof current.pendingCount === "number" && (
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-white/40">
                  У автора в очереди
                </dt>
                <dd
                  className={`font-bold ${current.pendingCount > 6 ? "text-red-400" : "text-white"}`}
                >
                  {current.pendingCount}
                </dd>
              </div>
            )}
          </dl>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void handleReject()}
              className="pixel-btn min-h-14 bg-red-600 text-base font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              Отклонить
              <span className="mt-0.5 block text-[10px] font-normal opacity-80">← / D</span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void handleApprove()}
              className="pixel-btn min-h-14 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Одобрить
              <span className="mt-0.5 block text-[10px] font-normal opacity-80">→ / A</span>
            </button>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleSkip}
            className="w-full text-center text-xs text-white/45 underline-offset-2 hover:text-white/70 hover:underline"
          >
            Пропустить без решения (Space)
          </button>
        </div>
      </article>

      {lightboxOpen && current.imageUrl && (
        <ScranImageLightbox
          src={current.imageUrl}
          alt={current.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
