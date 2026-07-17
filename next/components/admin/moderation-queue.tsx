"use client";

import { useState, type ReactElement } from "react";
import type { Scran } from "@/types/scran";
import { ScranImageLightbox } from "@/components/admin/scran-image-lightbox";

type Props = Readonly<{
  scrans: Scran[];
  role?: "moderator" | "admin" | null;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
  onRecheck?: (id: number) => void;
  onAuthor?: (telegramId: string | null | undefined) => void;
  onStartReview: () => void;
}>;

function authorLabel(scran: Scran): string {
  return (
    scran.authorUsername ||
    scran.authorDisplayName ||
    (scran.telegramId ? `tg:${scran.telegramId}` : "аноним")
  );
}

export function ModerationQueue({
  scrans,
  role,
  selectedIds,
  onToggleSelect,
  onApprove,
  onReject,
  onBan,
  onDelete,
  onRecheck,
  onAuthor,
  onStartReview,
}: Props): ReactElement {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (scrans.length === 0) {
    return (
      <div className="pixel-container border-4 border-black bg-zinc-900/80 px-6 py-16 text-center">
        <p className="pixel-text text-lg">Очередь пуста</p>
        <p className="mt-3 text-sm font-bold text-white/65">
          Новых блюд на проверку нет
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="border-2 border-black px-3 py-1.5 text-sm font-bold text-white"
          style={{
            background: "#27272a",
            boxShadow: "inset 2px 2px 0 #52525b, inset -2px -2px 0 #18181b",
          }}
        >
          <span className="text-white/55">В списке:</span>{" "}
          <span className="text-amber-300">{scrans.length}</span>
        </div>
        <button
          type="button"
          onClick={onStartReview}
          className="pixel-btn pixel-btn-warn px-4 py-2 text-sm font-bold"
        >
          Режим проверки →
        </button>
      </div>

      <ul className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {scrans.map((scran) => {
          const isSub = scran.isSubscriberAtSubmit === true;
          const pendingCount =
            typeof scran.pendingCount === "number" ? scran.pendingCount : undefined;
          const overLimit = pendingCount != null && pendingCount > 6;

          return (
            <li
              key={scran.id}
              className="pixel-container flex flex-col gap-4 border-4 border-black bg-zinc-900/90 p-3 sm:flex-row sm:p-4"
            >
              <button
                type="button"
                className="group relative shrink-0 self-center overflow-hidden border-2 border-black bg-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:self-start"
                onClick={() =>
                  scran.imageUrl &&
                  setLightbox({ src: scran.imageUrl, alt: scran.name })
                }
                disabled={!scran.imageUrl}
                title="Открыть фото"
              >
                {scran.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scran.imageUrl}
                    alt={scran.name}
                    className="h-40 w-40 object-cover transition group-hover:opacity-90 sm:h-44 sm:w-44"
                  />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-xs text-white/40 sm:h-44 sm:w-44">
                    нет фото
                  </div>
                )}
                <span className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                  открыть
                </span>
              </button>

              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-white/50">#{scran.id}</span>
                    <a
                      href={`/admin/scrans?id=${scran.id}`}
                      className="pixel-text truncate text-base font-bold text-amber-200 underline-offset-2 hover:underline sm:text-lg"
                    >
                      {scran.name}
                    </a>
                    {isSub && (
                      <span className="bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                        SVAGA+
                      </span>
                    )}
                    {scran.isSubscriberAtSubmit === null && (
                      <span className="bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Не проверено
                      </span>
                    )}
                  </div>
                  {scran.description && (
                    <p className="line-clamp-2 text-sm text-zinc-400">{scran.description}</p>
                  )}
                  <p className="text-sm text-white/80">
                    {scran.price.toFixed(2)} ₽
                    <span className="mx-2 text-white/30">·</span>
                    <button
                      type="button"
                      className="text-sky-300 underline-offset-2 hover:underline"
                      onClick={() => onAuthor?.(scran.telegramId)}
                    >
                      {authorLabel(scran)}
                    </button>
                    {pendingCount != null && (
                      <span
                        className={`ml-1 text-xs ${overLimit ? "font-bold text-red-400" : "text-amber-400"}`}
                      >
                        ({pendingCount} на модерации
                        {overLimit ? " ⚠️" : ""})
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  {onToggleSelect && (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1 text-xs text-white/60">
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(scran.id) ?? false}
                        onChange={() => onToggleSelect(scran.id)}
                        className="pixel-check"
                      />
                      bulk
                    </label>
                  )}
                  {!scran.approved && !scran.rejected && (
                    <>
                      <button
                        type="button"
                        onClick={() => onApprove(scran.id)}
                        className="pixel-btn pixel-btn-ok min-h-11 flex-1 px-4 py-2 text-sm font-bold sm:flex-none"
                      >
                        Одобрить
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(scran.id)}
                        className="pixel-btn pixel-btn-danger min-h-11 flex-1 px-4 py-2 text-sm font-bold sm:flex-none"
                      >
                        Отклонить
                      </button>
                    </>
                  )}
                  {scran.approved && role === "admin" && (
                    <button
                      type="button"
                      onClick={() => onBan(scran.id)}
                      className="pixel-btn pixel-btn-warn min-h-11 flex-1 px-4 py-2 text-sm font-bold sm:flex-none"
                    >
                      Снять
                    </button>
                  )}
                  {scran.isSubscriberAtSubmit === null && onRecheck && (
                    <button
                      type="button"
                      onClick={() => onRecheck(scran.id)}
                      className="pixel-btn pixel-btn-info min-h-11 flex-1 px-4 py-2 text-sm font-bold sm:flex-none"
                    >
                      SVAGA recheck
                    </button>
                  )}
                  {role === "admin" && (
                    <button
                      type="button"
                      onClick={() => onDelete(scran)}
                      className="pixel-btn min-h-11 flex-1 px-4 py-2 text-sm font-bold sm:flex-none"
                    >
                      Удалить
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {lightbox && (
        <ScranImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
