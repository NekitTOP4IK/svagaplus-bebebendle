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

function MetaChip({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className="border-2 border-black px-3 py-2"
      style={{
        background: "#2a2a2e",
        boxShadow: "inset 2px 2px 0 #4a4a50, inset -2px -2px 0 #121214",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-sm font-bold ${
          danger ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ scran }: { scran: Scran }) {
  if (scran.isSubscriberAtSubmit === true) {
    return (
      <span
        className="inline-flex border-2 border-black px-2 py-0.5 text-[10px] font-bold text-black"
        style={{
          background: "#4caf50",
          boxShadow: "inset 1px 1px 0 #8fdf91, inset -1px -1px 0 #1e4d20",
        }}
      >
        SVAGA+
      </span>
    );
  }
  if (scran.isSubscriberAtSubmit === null) {
    return (
      <span
        className="inline-flex border-2 border-black px-2 py-0.5 text-[10px] font-bold text-white"
        style={{
          background: "#52525b",
          boxShadow: "inset 1px 1px 0 #a1a1aa, inset -1px -1px 0 #27272a",
        }}
      >
        Не проверено
      </span>
    );
  }
  return (
    <span
      className="inline-flex border-2 border-black px-2 py-0.5 text-[10px] font-bold text-zinc-200"
      style={{
        background: "#3f3f46",
        boxShadow: "inset 1px 1px 0 #71717a, inset -1px -1px 0 #18181b",
      }}
    >
      Обычный
    </span>
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
        <p className="pixel-text text-xl font-bold">На этой странице всё разобрано</p>
        <p className="mt-3 text-sm font-bold text-white/70">
          {hasMorePages
            ? "Загрузи следующую страницу или выйди в список."
            : "Очередь пуста. Можно выдохнуть."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hasMorePages && (
            <button
              type="button"
              onClick={() => onNeedMore?.()}
              className="pixel-btn pixel-btn-warn px-4 py-2 text-sm font-bold"
            >
              Дальше по очереди
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="pixel-btn px-4 py-2 text-sm font-bold"
          >
            К списку
          </button>
        </div>
      </div>
    );
  }

  const disabled = acting || busy;
  const overPending =
    typeof current.pendingCount === "number" && current.pendingCount > 6;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="pixel-btn px-3 py-2 text-xs font-bold"
        >
          ← Список
        </button>
        <div
          className="border-2 border-black px-3 py-1.5 text-xs font-bold text-white"
          style={{
            background: "#27272a",
            boxShadow: "inset 2px 2px 0 #52525b, inset -2px -2px 0 #18181b",
          }}
        >
          <span className="text-white/55">Осталось:</span>{" "}
          <span className="text-amber-300">{remaining}</span>
          <span className="text-white/40"> / {scrans.length}</span>
        </div>
      </div>

      <article className="pixel-container overflow-hidden border-4 border-black bg-zinc-900/95">
        {/* Photo */}
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
              className="mx-auto max-h-[min(52dvh,480px)] w-full object-contain"
            />
          ) : (
            <div className="flex h-56 items-center justify-center text-sm font-bold text-white/40">
              нет фото
            </div>
          )}
          {current.imageUrl && (
            <span
              className="absolute bottom-2 right-2 border-2 border-black px-2 py-1 text-[10px] font-bold text-white"
              style={{ background: "rgba(0,0,0,0.75)" }}
            >
              полный размер
            </span>
          )}
        </button>

        <div className="space-y-4 border-t-4 border-black p-4 sm:p-5">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">
                #{current.id}
              </p>
              <h2 className="pixel-text mt-0.5 break-words text-xl font-bold sm:text-2xl">
                {current.name}
              </h2>
              <a
                href={`/admin/scrans?id=${current.id}`}
                className="mt-1 inline-block text-[11px] font-bold text-sky-300 underline-offset-2 hover:underline"
              >
                карточка скрана →
              </a>
            </div>
            <StatusBadge scran={current} />
          </div>

          {current.description ? (
            <p
              className="border-2 border-black px-3 py-2 text-sm leading-relaxed text-zinc-100"
              style={{
                background: "#1c1c1f",
                boxShadow: "inset 2px 2px 0 #3f3f46, inset -2px -2px 0 #0a0a0b",
              }}
            >
              {current.description}
            </p>
          ) : (
            <p className="text-xs font-bold italic text-white/35">без описания</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetaChip label="Цена" value={`${current.price.toFixed(2)} ₽`} />
            <MetaChip label="Автор" value={authorLabel(current)} />
            {typeof current.pendingCount === "number" && (
              <MetaChip
                label="В очереди у автора"
                value={String(current.pendingCount)}
                danger={overPending}
              />
            )}
          </div>

          {overPending && (
            <p className="text-xs font-bold text-red-400">
              ⚠️ У автора больше 6 pending — приоритет снижен
            </p>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void handleReject()}
              className="pixel-btn pixel-btn-danger min-h-14 text-base font-bold"
            >
              Отклонить
              <span className="mt-0.5 block text-[10px] font-bold opacity-80">
                ← / D
              </span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void handleApprove()}
              className="pixel-btn pixel-btn-ok min-h-14 text-base font-bold"
            >
              Одобрить
              <span className="mt-0.5 block text-[10px] font-bold opacity-80">
                → / A
              </span>
            </button>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleSkip}
            className="pixel-link-btn w-full py-1 text-center text-xs font-bold"
          >
            Пропустить без решения (Space / S)
          </button>

          <p className="text-center text-[10px] font-bold leading-relaxed text-white/35">
            Esc — к списку · стрелки / A D — решение
          </p>
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
